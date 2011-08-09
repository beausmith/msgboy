var MessageView = Backbone.View.extend({
    tagName: "div",
    className: "message",
    events: {
        "click" : "click",
        "click .up": "up",
        "click .down": "down"
    },
    initialize: function () {
        _.bindAll(this, "render", "up", "down");
        this.model.view = this;
        var controls = $("<span>", {
              class:"controls"
          }).appendTo($(this.el)),
          self = this,
          totalEl = $('#total'),
          loadedEl = $('#loaded'),
          shownEl = $('#shown'),
          imgDebug = $('#imgDebug'),
          hasImage = false;
        
        function updateColor() {
            imgDebug.css({background: (window.total === window.loaded) ? 'green' : 'red'});
        }
        
        $("<button>", {
            "class" : "vote down",
            "html" : "<img class='vote down' src='../images/minus.png' />"
        }).appendTo(controls);
        $("<button>", {
            "class" : "vote up",
            "html" : "<img class='vote down' src='../images/plus.png' />"
        }).appendTo(controls);
        $(this.el).attr("data-msgboy-relevance", this.model.attributes.relevance);
        $(this.el).attr("id", this.model.id);
        this.model.bind("change", this.render);
        $(this.el).addClass("text");
        $("<div>", {
            "class": "full-content",
            "style": "display:none"
        }).html(Msgboy.helper.cleaner.html(this.model.text())).appendTo($(this.el));
        
        
        // here we look through all images to add them to our global count
        this.$(".full-content img").each(function() {
            window.total += 1;
            totalEl.text(window.total);
            updateColor();
        });
        
        // here's the load event for all those same images. So we have a number to compare.
        this.$(".full-content img").load(function() {
            var img = $(this),
                img_size = Msgboy.helper.element.original_size(img);
            
            // TODO: remove me
            window.loaded += 1;
            loadedEl.text(window.loaded);
            updateColor();
            
            // eliminate the tracking pixels and set min of at least 50x50
            if (this.width > 50 && this.height > 50) {
                hasImage = true;
                self.$("p").addClass("darkened");
                var img = $("<img/>").attr("src", $(img).attr("src"));
                img.appendTo($(self.el));
                
                // TODO: remove me
                window.shown += 1;
                shownEl.text(window.shown);
                
                // Resize the image.
                if(img_size.width/img_size.height > $(self.el).width()/$(self.el).height()) {
                    self.$(".message > img").css("min-height", "150%");
                } else {
                    self.$(".message > img").css("min-width", "100%");
                }
    
                // show the source title.
                self.$("h1").text(self.model.attributes.source.title).appendTo($(self.el));
                
            }
        });
        
        // Adding the rest of the content.
        $("<p>").html(Msgboy.helper.cleaner.html(this.model.attributes.title)).appendTo($(this.el));
        $("<h1>").text(this.model.attributes.source.title).appendTo($(this.el));
        this.$("h1").css("background-image", "url('http://g.etfv.co/" + this.model.source_link() + "?defaulticon=lightpng')");
        // Chose a color for the box.
        var sum = 0;
        _.each(this.model.attributes.source.title.split(""), function (c) {
            sum += c.charCodeAt(0);
        });
        $(this.el).addClass("color" + sum % 7);
        // using grayscale for the time being. pending new color palette. -&yet:eric
        //$(this.el).css("background-color", "hsl(240,0%," + (sum%7)*10 + "%)");
        //$("<p>").html(Msgboy.helper.cleaner.html(sum%7)).appendTo($(this.el));
        this.render();
    },
    click: function (evt) {
        if (!$(evt.target).hasClass("vote")) {
            if (evt.shiftKey) {
                chrome.extension.sendRequest({
                    signature: "notify",
                    params: this.model.toJSON()
                });
            } else {
                chrome.extension.sendRequest({
                    signature: "tab",
                    params: {url: this.model.main_link(), selected: false}
                });
                this.trigger("clicked");
            }
        }
    },
    // Message was voted up
    up: function () {
        this.model.vote_up();
    },
    // Message was voted down
    down: function () {
        this.model.vote_down(function (result) {
            if (result.unsubscribe) {
                var request = {
                    signature: "unsubscribe",
                    params: this.model.attributes.feed
                };
                chrome.extension.sendRequest(request);
                this.trigger("delete-from-feed", this.model.attributes.feed);
            }
        }.bind(this));
    },
    render: function () {
        $(this.el).attr("data-msgboy-state", this.model.attributes.state);
        // Let's remove all the brick classes
        for (var i = 0; i <= 4; i = i + 1) {
            $(this.el).removeClass("brick-" + i);
        }
        // And add the right ones.
        if (this.model.attributes.state === "down-ed") {
            $(this.el).addClass("brick-1");
        } else if (this.model.attributes.state === "up-ed") {
            $(this.el).addClass("brick-4");
        } else {
            $(this.el).addClass("brick-" + Math.ceil(this.model.attributes.relevance * 4));
        }
        // Trigger rendered
        this.trigger("rendered");
    }
});

