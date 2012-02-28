var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var Isotope = require('../jquery.isotope.min.js');
require('../date.extensions.js');
var MessageView = require('./message-view.js').MessageView;
var Archive = require('../models/archive.js').Archive;

var ArchiveView = Backbone.View.extend({
    upperDound: new Date().getTime(),
    lowerBound: 0,
    loaded: 0,
    toLoad: 50,
    events: {
    },
    initialize: function () {
        window.v = this;
        _.bindAll(this, 'showNew', 'completePage', 'loadNext', 'addMark');
        $(document).scroll(this.completePage);

        $('#container').isotope({
            itemSelector: '.message',
            filter: '.brick-2 .brick-3 .brick-4',
            masonry: {
                columnWidth: 10,
            }
        });
        
        this.loadingTimes =[];
        this.loaded = this.toLoad;
        this.collection.bind('add', this.showNew);
        this.loadNext();
    },
    addMark: function(time) {
        if(!this.markShowed) {
            var mark = $("<div class='mark'>" + time.toRelativeTime()  + "</div>");
            mark.css("top", $("#container").height()+"px");
            mark.click(function() {
                mark.css("right", "-250px");
            })
            $("#container").append(mark);
            this.markShowed = true;
        }
    },
    completePage: function () {
        if ($("#container").height() < $(window).height()) {
            // We should also pre-emptively load more pages if the document is shorter than the page.
            this.loadNext();
        } else if ($(window).scrollTop() > $(document).height() - $(window).height() - 300) {
            // We're close to the bottom. Let's load an additional page!
            this.loadNext();
        }
    },
    loadNext: function () {
        if (this.loaded === this.toLoad) {
            this.loaded = 0; // Reset the loaded counter!
            this.collection.next(this.toLoad, {
                createdAt: [this.upperDound, this.lowerBound]
            });
        }
    },
    showNew: function (message) {
        this.upperDound = message.attributes.createdAt;
        this.loaded++;
        if(message.attributes.state !== "down-ed" && Math.ceil(message.attributes.relevance * 4) > 1) {
            message.bind('up-ed', function() {
                $('#container').isotope('reLayout');
            });

            message.bind('down-ed', function() {
                $('#container').isotope('reLayout');
            });

            message.bind('expanded', function() {
                $('#container').isotope('reLayout');
            })

            message.bind('unsubscribed', function() {
                // We have unsubscribed a feed. So we want to delete all of its brothers.
                var brothers = new Archive(); 
                brothers.bind('reset', function() {
                    var destroyedOne = _.after(brothers.models.length, function() {
                        // Once all brothers have been destroyed, we can redraw
                        $('#container').isotope('reLayout');
                    })
                    
                    _.each(brothers.models, function(brother) {
                        brother = this.collection.get(brother.id) || brother; // Rebinding to the right model.
                        brother.destroy({
                            silent: true,
                            success: destroyedOne
                        }); // Deletes the brothers 
                    }.bind(this));
                }.bind(this));
                brothers.forFeed(message.get('feed'));
            }.bind(this));

            var view = new MessageView({
                model: message
            });
            
            view.bind('rendered', function() {
                this.completePage();
                $('#container').append(view.el); // Adds the view in the document.
                $('#container').isotope('appended', $(view.el));
            }.bind(this));

            // Check if we can group the messages
            if (this.lastParentView && this.lastParentView.model.get('sourceLink') === message.get('sourceLink') && !message.get('ungroup')) {
                this.lastParentView.model.related.add(message);
                $(view.el).addClass('brother'); // Let's show this has a brother!
                view.render(); 
            }
            else {
                if(this.lastParentView) {
                    this.lastParentView.render();
                }
                this.lastParentView = view;
            }
        }
    }
});

exports.ArchiveView = ArchiveView;
