var httpProxy = require("http-proxy");
var http = require("http");
var fs = require("fs");

var configLocations = [
	"./.proxyrc.json",
	"~/.proxyrc.json"
];

function startProxy() {

	var config = loadConfig();
	var plugins = loadPlugins(config);
	if (!config) {
		console.error("Config not found");
		process.exit(1);
	}
	var proxy = httpProxy.createProxyServer({});
	var server = http.createServer(function(req, res) {
		var endProcessing = plugins.some(function(plugin) {
			return plugin(config, req, res); //if plugin returns true, it means it processed request, do not continue
		});
		if (endProcessing) {
			return;
		}
		(config.replaces || []).forEach(function(replace) {
			if (!replace.disabled) {
				req.url = req.url.replace(replace.pattern, replace.replacement);
			}
		});
		proxy.web(req, res, {
			target: req.url,
			//WARNING! toProxy and prependPath options are used to avoid url.parse
			//used by http-proxy, because it would escape some characters, eg. |
			//https://github.com/nodejitsu/node-http-proxy/issues/725
			//req.url on target server now returns full url instead of just path, is this ok?
			toProxy: true,
			prependPath: false
		});
	});
	server.listen(config.port);
}

function loadConfig() {
	var config;
	configLocations.some(function(location) {
		if (fs.existsSync(location)) {
			config = JSON.parse(fs.readFileSync(location, "utf-8"));
			return true;
		}
	});
	return config;
}

function loadPlugins(config) {
	return (config.plugins || []).map(function(plugin) {
		return require(plugin);
	});
}

if (require.main == module) {
	//launched from command line, start proxy now
	startProxy();
} else {
	//required from another module, just export function
	exports.startProxy = startProxy;
}
