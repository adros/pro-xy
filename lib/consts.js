var path = require("path");

exports.CONFIG_LOCATION = path.join(process.env.HOME, ".pro-xyrc.json");
exports.DEFAULT_PORT = 8000;
exports.LOG_FILE = path.join(process.env.HOME, "pro-xy-logs/pro-xy.log");
