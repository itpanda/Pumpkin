/* node packages */
var http = require("http"),
    fs = require("fs"),
    url = require("url"),
    querystring = require("querystring");

/* Optionally set port using first command line arg, default=8000 */
var args = process.argv.splice(2);
var port = parseInt(args[0]);
if (isNaN(port)) port = 8000;

/* Singleton ID generator */
var id = {
    next_id: 0,
    getNext: function() { return id.next_id++; }
}

/* All topics stored in an Object */
var topics = {};

/* Create a new topic and return its id */
function newTopic(text, link) {
    var topic_id = id.getNext();
    var topic = {
        "id": topic_id, 
        "text": text, 
        "link": link,
        "weight": 0,
        "replies": {}
    }

    topics[topic_id] = topic;
    return topic_id;
}

/* Create a new reply to main topic and return its id */
function newReplyToTopic(topic_id, text) {
    var reply_id = id.getNext();
    var reply = {
        "id": reply_id,
        "text": text,
        "votes": 0,
        "weight": 0,
        "replies": {},
        "children_ids": []
    }

    topics[topic_id].replies[reply_id] = reply;
    return reply_id;
}

function _findParentReplyByID(topic_id, parent_id, reply_id) {
    var replies = topics[topic_id].replies;

    function _contains(dict, key) { return (typeof dict[key] !== "undefined"); }

    function _searchForReply(replies, parent_id, reply_id) {
        for (var key in replies) {
            parent_id = parseInt(parent_id);

            if (replies[key].children_ids.indexOf(parent_id) !== -1) {
                replies[key].children_ids.push(reply_id);
                return _searchForReply(replies[key].replies, parent_id, reply_id);
            } else if (parseInt(key) === parent_id) {
                return replies[parent_id];
            }
        }
    }

    if (_contains(replies, parent_id)) {
        return replies[parent_id];
    } else {
       return _searchForReply(replies, parent_id, reply_id);
    }

    return false;
}

/* Create a new reply to another reply and return its id */
function newReplyToReply(topic_id, parent_id, text) {
    var reply_id = id.getNext();
    var reply = {
        "id": reply_id,
        "text": text,
        "votes": 0,
        "weight": 0,
        "replies": {},
        "children_ids": []
    }

    var parent_reply = _findParentReplyByID(topic_id, parent_id, reply_id);
    parent_reply.replies[reply_id] = reply;
    parent_reply.children_ids.push(reply_id);

    return reply_id;
}

/* tests for rendering */
function runTests() {
    console.log("*** Beginning of tests ***");

    /* populate with test topics */
    newTopic("Cool search engine", "http://google.com"); //id = 1
    newTopic("Special domain", "http://example.com"); //id = 2

    /* add replies to topics */
    newReplyToTopic(1, "just a reply"); //id = 3
    newReplyToTopic(1, "oohhh.. i like this a lot"); //id = 4

    newReplyToReply(1, 3, "nest1"); //id = 5
    newReplyToReply(1, 3, "nest 2"); //id = 6

    console.log(topics);
    console.log("*** End of tests ***");
}

http.createServer(function(request, response) {
		var pathname = url.parse(request.url).pathname,
            query = url.parse(request.url).query;
	
        /***** HANDLERS *****/
        var handle = {}
        handle["/"] = displayIndex;
        handle["/topic/all"] = getAllTopics;
        handle["/topic/add"] = addTopic;
        handle["/topic/reply/all"] = getAllReplies; //for specified topic
        handle["/topic/reply/add"] = addReply;
        //handle["/topic/reply/upvote"] = upvoteReply;

        /***** ROUTER *****/
        if (typeof handle[pathname] === 'function') {
            console.log("Routing a request for " + pathname);
            handle[pathname](request, response);
        } else {
            console.log("No request handler found for " + pathname);
            _displayError(response, 404);
        }

        /***** REQUEST HANDLERS *****/

        /* GET /topic/all --> JSON of all topics */
        function getAllTopics(request, response) {
            _writeHead(response, 200, 'json');
            _writeBody(response, JSON.stringify(topics));
        }

        /* POST /topic/add?text=XX&link=YY --> JSON of topic added */
        function addTopic(request, response) {
            var params = querystring.parse(query);
            var topic_id = newTopic(params.text, params.link);
            _writeHead(response, 200, 'json')
            _writeBody(response, JSON.stringify(topics[topic_id]));

            /*
            var body = '';
            request.on('data', function(chunk) {
                    body += chunk.toString();
                });
            request.on('end', function() {
                    var parsed_body = querystring.parse(body);
                    var topic_id = newTopic(parsed_body['text'], parsed_body['link']);
                    console.log(parsed_body);
                    _writeHead(response, 200, 'html');
                    _writeBody(response, topic_id.toString());
                });
            */
        }

        /* GET /topic/reply/all?topicid=XX --> JSON of all replies for specified topic */
        function getAllReplies(request, response) {
            var params = querystring.parse(query);
            var topic_id = params.topicid;

            if (typeof topics[topic_id] === "undefined") {
                _displayError(response, 500, "invalid topicid");
            } else {
                _writeHead(response, 200, "json");
                _writeBody(response, JSON.stringify(topics[topic_id].replies));
            }
        }

        //INCOMPLETE
        /* POST /topic/reply/add?topicid=XX&parentid=YY&text=ZZ --> JSON of reply added */
        function addReply(request, response) {
            var params = querystring.parse(query);
            var topic_id = params.topicid;
            var parent_id = params.parentid;
            var reply_text = params.text;
            var reply_id;

            if (typeof parent_id === "undefined") {
                reply_id = newReplyToTopic(topic_id, reply_text);
                _writeHead(response, 200, 'json');
                _writeBody(response, JSON.stringify(topics[topic_id].replies[reply_id]));
            } else {
                reply_id = newReplyToReply(topic_id, parent_id, reply_text)
                var parent_reply = _findParentReplyByID(topic_id, parent_id, reply_id);
                _writeHead(response, 200, 'json');
                _writeBody(response, JSON.stringify(parent_reply.replies[reply_id]));
            }
        }

        /* Serve page index.html */
        function displayIndex(request, response) {
            fs.readFile("./index.html", function(error, content) {
                    if (error) {
                        _displayError(response, 404);
                    }
                    else {
                        _writeHead(response, 200, "html");
                        _writeBody(response, content)
                    }
                });
        }

        /***** HELPER FUNCTIONS *****/

        /* error handler */
        function _displayError(response, error_code, error_msg) {
            error_msg = typeof error_msg !== "undefined" ? error_code + " " + error_msg : error_code + " not found";
            _writeHead(response, error_code, 'plain');
            _writeBody(response, error_msg);
        }

        /* Helper for response.writeHead */
        function _writeHead(response, html_code, content_type) {
            if (content_type === "plain" || content_type === "html") {
                content_type = "text/" + content_type;
            } else if (content_type === "json") {
                content_type = "application/" + content_type;
            } else {
                content_type = "text/plain";
            }
            response.writeHead(html_code, {"Content-Type": content_type});
        }

        /* Helper for response.write */
        function _writeBody (response, body_content, encoding) {
            encoding = typeof encoding !== "undefined" ? encoding : "utf-8";
            response.write(body_content);
            response.end();
        }

    }).listen(port);

runTests();
console.log("Server running at http://127.0.0.1:" + port + "/");

