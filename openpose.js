function init() {

    local.parameters.oscInput.setCollapsed(true);
    local.parameters.oscOutputs.setCollapsed(true);


    local.scripts.setCollapsed(true);
    local.scripts.getChild("openpose").enableLog.set(true);

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

    if (param == local.parameters.openPose.preview) {
        local.send("/openpose/preview", local.parameters.openPose.preview.get());
    }

    if (param == local.parameters.openPose.threshold) {
        local.send("/openpose/threshold", local.parameters.openPose.threshold.get());
    }
}

function startTracking() {

    var launchScript = local.parameters.openPose.launchScript.get();
    
    var oscInput = local.parameters.oscInput.localPort.get();
    var oscOutput = local.parameters.oscOutputs.oscOutput.remotePort.get();
    
    var preview = local.parameters.openPose.preview.get();
    var threshold = local.parameters.openPose.threshold.get();


    var args = [
        "--osc-out", oscInput,
        "--osc-in", oscOutput,
        "--preview", preview,
        "--threshold", threshold
    ];

    
    util.launchFile(launchScript, args.join(" "));
}

function getModuleDirectory() {

    var scriptPath = util.scriptPath;
    var scriptDir = extractDirectory(scriptPath);

    return scriptDir;
}

function extractDirectory(path) {
    var pathParts = path.split('/');

    var newPathParts = [];
    for (var i = 0; i < pathParts.length - 1; i++) {
        newPathParts.push(pathParts[i]);
    }

    return newPathParts.join('/');
}