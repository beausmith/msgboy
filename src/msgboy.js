var Url = require('url');
var QueryString = require('querystring');
var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
var Subscriptions = require('./models/subscription.js').Subscriptions;
var Subscription = require('./models/subscription.js').Subscription;
var Inbox = require('./models/inbox.js').Inbox;

if (typeof Msgboy === "undefined") {
    var Msgboy = {};
}

// Extending Msgboy with the Backbone events
_.extend(Msgboy, Backbone.Events);

// Logs messages to the console
console._log = console.log;
Msgboy.log =  {
    levels: {
        RAW: 0,
        DEBUG: 10,
        INFO: 20,
        ERROR: 30,
    },
    _log: Function.prototype.bind.call(console._log, console),
    raw: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.RAW) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('raw');
            this._log.apply(console, args);
        }
    },
    debug: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.DEBUG) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('debug');
            this._log.apply(console, args);
        }
    },
    info: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.INFO) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('info');
            this._log.apply(console, args);
        }
    },
    error: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.ERROR) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('error');
            this._log.apply(console, args);
        }
    },
}

// Also, hijack all console.log messages
console.log = function() {
    var args = Array.prototype.slice.call(arguments);  
    args.unshift('debug');
    Msgboy.log.debug.apply(this, args);
}

// Attributes
Msgboy.log.debugLevel = Msgboy.log.levels.ERROR; // We may want to adjust that in production!
Msgboy.autoReconnect = true;
Msgboy.currentNotification = null;
Msgboy.messageStack = [];
Msgboy.connectionTimeout = null;
Msgboy.reconnectDelay = 1;
Msgboy.connection = null;
Msgboy.infos = {};
Msgboy.inbox = new Inbox();
Msgboy.reconnectionTimeout = null;

// Returns the environment in which this msgboy is running
Msgboy.environment = function () {
    if (chrome.i18n.getMessage("@@extension_id") === "ligglcbjgpiljeoenbhnnfdipkealakb") {
        return "production";
    }
    else {
        return "development";
    }
};

if(Msgboy.environment() === "development") {
    Msgboy.log.debugLevel = Msgboy.log.levels.RAW;
}

// Runs the msgboy (when the document was loaded and when we were able to extract the msgboy's information)
Msgboy.run =  function () {
    window.onload = function () {
        chrome.management.get(chrome.i18n.getMessage("@@extension_id"), function (extension_infos) {
            Msgboy.infos = extension_infos;
            Msgboy.inbox = new Inbox();
            Msgboy.inbox.fetch({
                success: function() {
                    Msgboy.trigger("loaded");
                }
            });
        });
    }
};

// Handles XMPP Connections
Msgboy.onConnect = function (status) {
    var msg = '';
    if (status === Strophe.Status.CONNECTING) {
        msg = 'Msgboy is connecting.';
    } else if (status === Strophe.Status.CONNFAIL) {
        msg = 'Msgboy failed to connect.';
        Msgboy.reconnectDelay = 1;
        if (Msgboy.autoReconnect) {
            Msgboy.reconnect();
        }
    } else if (status === Strophe.Status.AUTHFAIL) {
        msg = 'Msgboy couldn\'t authenticate. Please check your credentials';
        Msgboy.autoReconnect = false; // We need to open the settings tab
        chrome.tabs.create({
            url: chrome.extension.getURL('/views/html/options.html'),
            selected: true
        });
    } else if (status === Strophe.Status.DISCONNECTING) {
        msg = 'Msgboy is disconnecting.'; // We may want to time this out.
    } else if (status === Strophe.Status.DISCONNECTED) {
        if (Msgboy.autoReconnect) {
            Msgboy.reconnect();
        }
        msg = 'Msgboy is disconnected. Reconnect in ' + Math.pow(Msgboy.reconnectDelay, 2) + ' seconds.';
    } else if (status === Strophe.Status.CONNECTED) {
        Msgboy.autoReconnect = true; // Set autoReconnect to true only when we've been connected :)
        msg = 'Msgboy is connected.';
        Msgboy.reconnectDelay = 1;
        Msgboy.connection.send($pres().tree()); // Send presence!
        Msgboy.trigger('connected');
    }
    Msgboy.log.debug(msg);
};

// Reconnects the Msgboy
Msgboy.reconnect = function () {
    Msgboy.reconnectDelay = Math.min(Msgboy.reconnectDelay + 1, 10); // We max at one attempt every minute.
    if (!Msgboy.reconnectionTimeout) {
        Msgboy.reconnectionTimeout = setTimeout(function () {
            Msgboy.reconnectionTimeout = null;
            Msgboy.connect();
        }, Math.pow(Msgboy.reconnectDelay, 2) * 1000);
    }
};

// Connects the XMPP Client
// It also includes a timeout that tries to reconnect when we could not connect in less than 1 minute.
Msgboy.connect = function () {
    Msgboy.connection.rawInput = function (data) {
        Msgboy.log.raw('RECV', data);
    };
    Msgboy.connection.rawOutput = function (data) {
        Msgboy.log.raw('SENT', data);
    };
    var password = Msgboy.inbox.attributes.password;
    var jid = Msgboy.inbox.attributes.jid + "@msgboy.com/" + Msgboy.infos.version;
    Msgboy.connection.connect(jid, password, this.onConnect);
};

// Shows a popup notification
Msgboy.notify = function (message, popup) {
    // Open a notification window if needed!
    if (!Msgboy.currentNotification && popup) {
        url = chrome.extension.getURL('/views/html/notification.html');
        Msgboy.currentNotification = window.webkitNotifications.createHTMLNotification(url);
        Msgboy.currentNotification.onclose = function () {
            Msgboy.currentNotification = null;
        };
        Msgboy.currentNotification.ready = false;
        Msgboy.currentNotification.show();
        Msgboy.messageStack.push(message);
    }
    else {
        chrome.extension.sendRequest({
            signature: "notify",
            params: message
        }, function (response) {
            // Nothing to do.
        });
    }
    return Msgboy.currentNotification;
};

// Subscribes to a feed.
Msgboy.subscribe = function (url, force, callback) {
    // First, let's check if we have a subscription for this.
    var subscription = new Subscription({id: url});
    
    subscription.fetchOrCreate(function () {
        // Looks like there is a subscription.
        if ((subscription.needsRefresh() && subscription.attributes.state === "unsubscribed") || force) {
            subscription.setState("subscribing");
            subscription.bind("subscribing", function () {
                Msgboy.log.debug("subscribing to", url);
                Msgboy.connection.superfeedr.subscribe(url, function (result, feed) {
                    Msgboy.log.debug("subscribed to", url);
                    subscription.setState("subscribed");
                });
            });
            subscription.bind("subscribed", function () {
                callback(true);
            });
        }
        else {
            Msgboy.log.debug("Nothing to do for", url, "(", subscription.attributes.state , ")");
            callback(false);
        }
    });
};

// Unsubscribes from a feed.
Msgboy.unsubscribe = function (url, callback) {
    var subscription = new Subscription({id: url});
    subscription.fetchOrCreate(function () {
        subscription.setState("unsubscribing");
        subscription.bind("unsubscribing", function () {
            Msgboy.log.debug("unsubscribing from", url);
            Msgboy.connection.superfeedr.unsubscribe(url, function (result) {
                Msgboy.log.debug("unsubscribed", url);
                subscription.setState("unsubscribed");
            });
        });
        subscription.bind("unsubscribed", function () {
            callback(true);
        });
    });
};

// Makes sure there is no 'pending' susbcriptions.
Msgboy.resumeSubscriptions = function () {
    var subscriptions  = new Subscriptions();
    subscriptions.bind("add", function (subs) {
        Msgboy.log.debug("subscribing to", subs.id);
        Msgboy.connection.superfeedr.subscribe(subs.id, function (result, feed) {
            Msgboy.log.debug("subscribed to", subs.id);
            subs.setState("subscribed");
        });
    });
    subscriptions.pending();
    setTimeout(function () {
        Msgboy.resumeSubscriptions(); // Let's retry in 10 minutes.
    }, 1000 * 60 * 10);
};

// Extracts the largest image of an HTML content
Msgboy.extractLargestImage = function(blob, callback) {
    var container = $("<div>");
    var largestImg = null;
    var largestImgSize = null;
    var done = null;
    
    var timeout = setTimeout(function() {
        done();
    }, 3000); // We allow for 3 seconds to extract images.
    
    done = function() {
        clearTimeout(timeout);
        callback(largestImg);
    } // When done, let's just cancel the timeout and callback with the largest image.
    
    try {
        var content = $(blob)
        container.append(content);
        var images = container.find("img");

        if(images.length > 0) {
            // Let's try to extract the image for this message.

            var imgLoaded = _.after(images.length, function() {
                done();
            });

            _.each(images, function(image) {
                var src = $(image).attr('src');
                if(!src || typeof src === "undefined") {
                    imgLoaded();
                }
                else {
                    var imgTag = $("<img/>").attr("src", src);
                    imgTag.load(function() {
                        if((!largestImgSize || largestImgSize < this.height * this.width) && 
                        !(this.height === 250 && this.width === 300) && 
                        !(this.height < 100  || this.width < 100) &&
                        !src.match('/doubleclick.net/')) {
                            largestImgSize = this.height * this.width;
                            largestImg = src;
                        }
                        imgLoaded();
                    });
                }
            });
        }
        else {
            // No image!
            done();
        }
    }
    catch(err) {
        Msgboy.log.error("Couldn't extract images from", blob, err);
        done();
    }
}

// Rewrites URL and adds tacking code. This will be useful for publishers who use Google Analytics to measure their traffic.
Msgboy.rewriteOutboundUrl = function(url) {
    var parsed = Url.parse(url);
    parsed.href = parsed.search = ""; // Deletes the href and search, which are to be re-composed with the new qs.

    var qs = QueryString.parse(parsed.query);
    qs.utm_source = 'msgboy'; // Source is Msgboy
    qs.utm_medium = 'feed'; // Medium is feed
    qs.utm_campaign = qs.utm_campaign || 'msgboy'; // Campaign is persisted or msgboy

    parsed.query = qs; // Re-assign the query
    
    return Url.format(parsed);
}

exports.Msgboy = Msgboy;

