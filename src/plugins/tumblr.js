var $ = jQuery = require('jquery');

Tumblr = function () {

    this.name = 'Tumblr'; // Name for this plugin. The user will be asked which plugins he wants to use.
    this.onSubscriptionPage = function (doc) {
        return (doc.location.host === "www.tumblr.com" && doc.location.pathname === '/dashboard/iframe');
    };

    this.hijack = function (follow, unfollow) {
        $('form[action|="/follow"]').submit(function (event) {
            follow({
                title: $('form[action|="/follow"] input[name="id"]').val() + " on Tumblr",
                url: "http://" + $('form[action|="/follow"] input[name="id"]').val() + ".tumblr.com/rss"
            }, function () {
                // Done
            });
        });
    };


    this.listSubscriptions = function (callback, done) {
        this.listSubscriptionsPage(1, 0, callback, done);
    };

    this.listSubscriptionsPage = function (page, subscriptions, callback, done) {
        $.get("http://www.tumblr.com/following/page/" + page, function (data) {
            var content = $(data);
            var links = content.find(".follower .name a");
            links.each(function (index, link) {
                callback({
                    url: $(link).attr("href") + "rss",
                    title: $(link).html() + " on Tumblr"
                });
                subscriptions += 1;
            });
            if (links.length > 0) {
                this.listSubscriptionsPage(page + 1, subscriptions, callback, done);
            } else {
                done(subscriptions);
            }
        }.bind(this));
    };
};

exports.Tumblr = Tumblr;