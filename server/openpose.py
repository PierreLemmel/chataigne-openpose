import time
import cv2 as cv
import argparse

from pythonosc import udp_client
from pythonosc.dispatcher import Dispatcher
from pythonosc import osc_server
from pythonosc import osc_bundle_builder
from pythonosc import osc_message_builder
import threading
import atexit
import signal


parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True, help='Path to the binary .pb file.')
parser.add_argument('--threshold', default=0.2, type=float, help='Threshold value for pose parts heat map')
parser.add_argument('--width', default=368, type=int, help='Resize input to specific width.')
parser.add_argument('--height', default=368, type=int, help='Resize input to specific height.')
parser.add_argument('--osc-out', default=12000, type=int, help='OSC output port.')
parser.add_argument('--osc-in', default=12001, type=int, help='OSC input port.')
parser.add_argument('--preview', default=0, type=int, help='Show preview window.')
parser.add_argument('--ip', default="127.0.0.1", type=str, help='IP for OSC server and client.')

args = parser.parse_args()

BODY_PARTS = { "Nose": 0, "Neck": 1, "RShoulder": 2, "RElbow": 3, "RWrist": 4,
               "LShoulder": 5, "LElbow": 6, "LWrist": 7, "RHip": 8, "RKnee": 9,
               "RAnkle": 10, "LHip": 11, "LKnee": 12, "LAnkle": 13, "REye": 14,
               "LEye": 15, "REar": 16, "LEar": 17 }

POSE_PAIRS = [ ["Neck", "RShoulder"], ["Neck", "LShoulder"], ["RShoulder", "RElbow"],
               ["RElbow", "RWrist"], ["LShoulder", "LElbow"], ["LElbow", "LWrist"],
               ["Neck", "RHip"], ["RHip", "RKnee"], ["RKnee", "RAnkle"], ["Neck", "LHip"],
               ["LHip", "LKnee"], ["LKnee", "LAnkle"], ["Neck", "Nose"], ["Nose", "REye"],
               ["REye", "REar"], ["Nose", "LEye"], ["LEye", "LEar"] ]

inWidth = args.width
inHeight = args.height
model = args.model
oscOut = args.osc_out
oscIn = args.osc_in
threshold = args.threshold
preview = args.preview != 0
ip = args.ip


winName = "OpenPose using OpenCV"
request_win_delete = False
request_stop = False

osc_client = udp_client.SimpleUDPClient(ip, oscOut)
osc_client.send_message("/openpose/started", [])

def on_threshold_changed(_, *args):
    globals().update(threshold=float(args[0]))

def on_preview_changed(_, *args):
    new_preview = bool(args[0])
    globals().update(preview=new_preview)

    if not new_preview:
        globals().update(request_win_delete=True)

def on_stop_requested(_, *args):
    globals().update(request_stop=True)

server: osc_server.ThreadingOSCUDPServer = None
def start_server():
    dispatcher = Dispatcher()
    dispatcher.map("/openpose/threshold", on_threshold_changed)
    dispatcher.map("/openpose/preview", on_preview_changed)
    dispatcher.map("/openpose/stop", on_stop_requested)

    server = osc_server.ThreadingOSCUDPServer((ip, oscIn), dispatcher)

    print(f"Starting OSC server on {ip}:{oscIn}...")
    
    globals().update(server=server)
    server.serve_forever()
    print("OSC server stopped...")
    

def start_keepalive():
    while not request_stop:
        osc_client.send_message("/openpose/keepalive", [])
        time.sleep(1)

server_thread = threading.Thread(target=start_server)
server_thread.daemon = True
server_thread.start()

keepalive_thread = threading.Thread(target=start_keepalive)
keepalive_thread.daemon = True
keepalive_thread.start()


net = cv.dnn.readNetFromTensorflow(model)

print("Starting OpenPose using OpenCV...")
cap = cv.VideoCapture(0)

points = []


def cleanup():
    print("Stopping OpenPose using OpenCV...")
    osc_client.send_message("/openpose/stopped", [])

    cap.release()
    cv.destroyAllWindows()

    print("Stopping OSC server...")
    server.shutdown()
    server_thread.join()

    print("OpenPose using OpenCV finished...")

atexit.register(cleanup)
signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

while cv.waitKey(10) < 0 and not request_stop:
    hasFrame, frame = cap.read()
    if not hasFrame:
        cv.waitKey()
        break

    frameWidth = frame.shape[1]
    frameHeight = frame.shape[0]
    
    net.setInput(cv.dnn.blobFromImage(frame, 1.0, (inWidth, inHeight), (127.5, 127.5, 127.5), swapRB=True, crop=False))
    out = net.forward()
    out = out[:, :18, :, :]  # MobileNet output [1, 57, -1, -1], we only need the first 19 elements

    outWidth = out.shape[3]
    outHeight = out.shape[2]
    
    assert(len(BODY_PARTS) == out.shape[1])

    for i in range(len(BODY_PARTS)):
        # Slice heatmap of corresponging body's part.
        heatMap = out[0, i, :, :]

        # Originally, we try to find all the local maximums. To simplify a sample
        # we just find a global one. However only a single pose at the same time
        # could be detected this way.
        _, conf, _, point = cv.minMaxLoc(heatMap)

        result = (point[0] / outWidth, point[1] / outHeight) if conf > threshold else None
        points.append(result)


    bundle = osc_bundle_builder.OscBundleBuilder(
        osc_bundle_builder.IMMEDIATELY
    )
    
    for idx, point in enumerate(points):
        msg = osc_message_builder.OscMessageBuilder("/openpose/person1")

        msg.add_arg(idx)
        if point:
            msg.add_arg(True)
            msg.add_arg(point[0])
            msg.add_arg(point[1])
        else:
            msg.add_arg(False)

        bundle.add_content(msg.build())
    
    t, _ = net.getPerfProfile()
    freq = cv.getTickFrequency()
    fps = freq / t
    processingTimeMs = 1000 / fps

    msg = osc_message_builder.OscMessageBuilder("/openpose/profiling")
    msg.add_arg(fps)
    msg.add_arg(processingTimeMs)

    bundle.add_content(msg.build())

    osc_client.send(bundle.build())

    if preview:

        for pair in POSE_PAIRS:
            partFrom = pair[0]
            partTo = pair[1]

            idFrom = BODY_PARTS[partFrom]
            idTo = BODY_PARTS[partTo]

            pointFrom = points[idFrom]
            pointTo = points[idTo]

            if pointFrom and pointTo:

                pointFrom = (int(pointFrom[0] * frameWidth), int(pointFrom[1] * frameHeight))
                pointTo = (int(pointTo[0] * frameWidth), int(pointTo[1] * frameHeight))

                cv.line(frame, pointFrom, pointTo, (0, 255, 0), 3)
                cv.ellipse(frame, pointFrom, (3, 3), 0, 0, 360, (0, 0, 255), cv.FILLED)
                cv.ellipse(frame, pointTo, (3, 3), 0, 0, 360, (0, 0, 255), cv.FILLED)

        cv.putText(frame, 'Processing: %.2fms' % (processingTimeMs), (10, 20), cv.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0))
        cv.putText(frame, 'FPS: %.2f' % (fps), (10, 40), cv.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0))
        cv.putText(frame, 'Threshold: %.2f' % (threshold), (10, 60), cv.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0))
    
        cv.imshow(winName, frame)

    else:
        if request_win_delete:
            cv.destroyAllWindows()
            request_win_delete = False
        
    points.clear()


