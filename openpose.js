var lastKeepAliveTime = 0;

function init() {

    local.parameters.oscInput.setCollapsed(true);
    local.parameters.oscOutputs.setCollapsed(true);

    local.values.person1.setCollapsed(true);
    local.values.profiling.setCollapsed(true);

    local.scripts.setCollapsed(true);
    local.scripts.getChild("openpose").enableLog.set(true);

    lastKeepAliveTime = util.getTime();
}

function moduleParameterChanged(param) {

    if (param.is(local.parameters.openPose.launchScript)) {
        script.log("LaunchScript changed, consider restarting the script");
    }

    if (param.is(local.parameters.oscOutputs.oscOutput.remotePort)) {
        script.log("OSC output port changed, consider restarting the script");
    }

    if (param.is(local.parameters.oscInput.localPort)) {
        script.log("OSC input port changed, consider restarting the script");
    }

    if (param.is(local.parameters.openPose.preview)) {
        local.send("/openpose/preview", local.parameters.openPose.preview.get());
    }

    if (param.is(local.parameters.openPose.threshold)) {
        local.send("/openpose/threshold", local.parameters.openPose.threshold.get());
    }

    if (param.niceName === "Start Open Pose") {
        startTracking();
    }
    
    if (param.niceName === "Stop Open Pose") {
        stopTracking();
    }
}

function update() {

    var isRunning = local.parameters.openPoseRunning.get();
    if (isRunning) {
        var time = util.getTime();
        
        if (time - lastKeepAliveTime > 5) {
            script.log("Stopping Open Pose due to inactivity");
            local.parameters.openPoseRunning.set(false);
        }
    }
}

function startTracking() {

    if (local.parameters.openPoseRunning.get()) {
        script.log("OpenPose is already running, can't start it!");
        return;
    }

    script.log("Starting OpenPose...");
    var launchScript = local.parameters.openPose.launchScript.get();
    
    if (launchScript === "") {
        script.logError("No launch script specified. Add the path to the 'launch.bat' file.");
        return;
    }

    var oscInput = local.parameters.oscInput.localPort.get();
    var oscOutput = local.parameters.oscOutputs.oscOutput.remotePort.get();
    
    var preview = local.parameters.openPose.preview.get();
    var threshold = local.parameters.openPose.threshold.get();


    var args = [
        "--osc-out", oscInput,
        "--osc-in", oscOutput,
        "--preview", preview,
        "--threshold", threshold
    ].join(" ");


    script.log("Launching: '" + launchScript + " " + args + "'");
    lastKeepAliveTime = util.getTime();
    util.launchFile(launchScript, args);
}

function stopTracking() {
    if (!local.parameters.openPoseRunning.get()) {
        script.log("OpenPose is not running, can't stop it!");
        return;
    }
    local.send("/openpose/stop");
}

var eventMap = [
    // 0: Nose
    {
        tracked: local.values.person1.noseTracked,
        position: local.values.person1.nosePosition,
    },
    // 1: Neck
    {
        tracked: local.values.person1.neckTracked,
        position: local.values.person1.neckPosition,
    },
    // 2: Right Shoulder
    {
        tracked: local.values.person1.rightShoulderTracked,
        position: local.values.person1.rightShoulderPosition,
    },
    // 3: Right Elbow
    {
        tracked: local.values.person1.rightElbowTracked,
        position: local.values.person1.rightElbowPosition,
    },
    // 4: Right Wrist
    {
        tracked: local.values.person1.rightWristTracked,
        position: local.values.person1.rightWristPosition,
    },
    // 5: Left Shoulder
    {
        tracked: local.values.person1.leftShoulderTracked,
        position: local.values.person1.leftShoulderPosition,
    },
    // 6: Left Elbow
    {
        tracked: local.values.person1.leftElbowTracked,
        position: local.values.person1.leftElbowPosition,
    },
    // 7: Left Wrist
    {
        tracked: local.values.person1.leftWristTracked,
        position: local.values.person1.leftWristPosition,
    },
    // 8: Right Hip
    {
        tracked: local.values.person1.rightHipTracked,
        position: local.values.person1.rightHipPosition,
    },
    // 9: Right Knee
    {
        tracked: local.values.person1.rightKneeTracked,
        position: local.values.person1.rightKneePosition,
    },
    // 10: Right Ankle
    {
        tracked: local.values.person1.leftAnkleTracked,
        position: local.values.person1.leftAnklePosition,
    },
    // 11: Left Hip
    {
        tracked: local.values.person1.leftHipTracked,
        position: local.values.person1.leftHipPosition,
    },
    // 12: Left Knee
    {
        tracked: local.values.person1.leftKneeTracked,
        position: local.values.person1.leftKneePosition,
    },
    // 13: Left Ankle
    {
        tracked: local.values.person1.leftAnkleTracked,
        position: local.values.person1.leftAnklePosition,
    },
    // 14: Right Eye
    {
        tracked: local.values.person1.rightEyeTracked,
        position: local.values.person1.rightEyePosition,
    },
    // 15: Left Eye
    {
        tracked: local.values.person1.leftEyeTracked,
        position: local.values.person1.leftEyePosition,
    },
    // 16: Right Ear
    {
        tracked: local.values.person1.rightEarTracked,
        position: local.values.person1.rightEarPosition,
    },
    // 17: Left Ear
    {
        tracked: local.values.person1.leftEarTracked,
        position: local.values.person1.leftEarPosition,
    }
];

function oscEvent(adress, args) {

    if (adress === "/openpose/person1") {

        var target = eventMap[args[0]];

        if (target) {
            target.tracked.set(args[1] == 1);

            if (args[1] == 1) {
                target.position.set(args[2], args[3]);
            }
        }
        else {
            script.log("Unknown person1 part: " + args[0]);
        }
    }
    else if (adress === "/openpose/profiling") {
        var fps = args[0];
        var processingTime = args[1];

        local.values.profiling.fps.set(fps);
        local.values.profiling.processingTime.set(processingTime);
    }
    else if (adress === "/openpose/keepalive") {
        lastKeepAliveTime = util.getTime();
    }
    else if (adress === "/openpose/started") {
        local.parameters.openPoseRunning.set(true);
        script.log("OpenPose server started");
    }
    else if (adress === "/openpose/stopped") {
        local.parameters.openPoseRunning.set(false);
        script.log("OpenPose server stopped");
    }
    else {
        script.log("Unknown OSC adress: " + adress);
    }
}