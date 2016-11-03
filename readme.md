# pro-xy
Simple pluggable http proxy.

It also allows to define plugins, that can change request or response in any other way.

## Usage

1. Install
		npm install -g pro-xy

2. Run.
		pro-xy

Alternatively pro-xy can also be required from another module and launched be calling *start* method.

## Config file

Sample:

	{
		"port" : 8000,
		"plugins" : [
			"pro-xy-cookie-replacer",
			"pro-xy-auto-responder",
			"pro-xy-url-replacer"
		],
		"pro-xy-cookie-replacer" : [
			{
				"urlPattern" : ".*",
				"pattern" : "test",
				"replacement" : "_test"
			}
		],
		"pro-xy-auto-responder" : [
			{
				"test" : "/svc/users",
				"target" : "users.json"
			}
		],		
		"pro-xy-url-replacer" : [
			{
				"name" : "test9090",
				"pattern" : "//localhost:8080/svc/",
				"replacement" : "//testserver.company.com:9090/svc/",
				"disabled" : false
			}
		],
	}

This sample file defines single replace, that will cause that all requests to "//localhost:8080/svc/*" will not go to the localhost. Instead they will be redirected to "//testserver.company.com:9090/svc/*". The rest of URL is left unchanged.

It also defines 2 plugins and their configs. See their docs for details.

* **port** - port for proxy
* **replace** - array of replaces to apply
	* **name** - any string to identify replace, e.g. name of target environment
	* **pattern** - RegExp to match in request URLs
	* **replacement** - string to replace matched part of request URL
	* **disabled** - boolean used to temporarily disable replace, so that you can keep multiple replaces in a single config file and easily switch between them
* **plugins** - list of plugins to use. Plugins are represented by name of their npm package and must be installed alongside url-replace to be used.

## Plugins

Plugins are npm packages with single function which receives config, request and response. If plugin returns truthy value, it means it has processed request completely and no following plugins and replaces will be applied.

	function(config, req, res) {
		//do something
		return false;
	}
