var _ = require('underscore');
var $ = jQuery = require('jquery');
var Backbone = require('backbone');
Backbone.sync = require('backbone-indexeddb').sync;
var Inbox = require('../models/inbox.js').Inbox;

var OptionsView = Backbone.View.extend({
    events: {
        "change #relevance": "adjustRelevance",
        "click #resetRusbcriptions": "resetRusbcriptions",
        "click #pinMsgboy": "pinMsgboy"
    },
    el: "#options",

    initialize: function () {
        _.bindAll(this, "render", "adjustRelevance", "resetRusbcriptions", "pinMsgboy", "saveModel");
        this.model = new Inbox();
        this.model.bind("change", function () {
            this.render();
            chrome.extension.sendRequest({
                signature: "reload",
                params: {}
            });
        }.bind(this));
        this.model.fetch();
    },

    render: function () {
        this.$("#relevance").val((1 - this.model.attributes.options.relevance) * 100);
        if(this.model.attributes.options.pinMsgboy) {
            this.$("#pinMsgboy").val("pined");
            this.$("#pinMsgboy").html("Unpin");
        }
        else {
            this.$("#pinMsgboy").val("unpined");
            this.$("#pinMsgboy").html("Pin");
        }
    },

    adjustRelevance: function (event) {
        this.saveModel();
    },

    resetRusbcriptions: function (event) {
        chrome.extension.sendRequest({
            signature: "resetRusbcriptions",
            params: {}
        }, function () {
            // Nothing to do.
        });
    },
    
    pinMsgboy: function(event) {
        if(this.$("#pinMsgboy").val() === "unpined") {
            this.$("#pinMsgboy").val("pined");
        }
        else {
            this.$("#pinMsgboy").val("unpined");
        }
        
        this.saveModel();
        chrome.tabs.getCurrent(function(tab) {
            chrome.tabs.update(tab.id, {pinned: this.$("#pinMsgboy").val() === "pined"}, function() {
                // Done
            }.bind(this))
        }.bind(this));
    },
    
    saveModel: function() {
        var attributes = {};
        attributes.options = {};
        attributes.options['pinMsgboy'] = this.$("#pinMsgboy").val() === "pined";
        attributes.options['relevance'] = 1 - this.$("#relevance").val() / 100;
        this.model.set(attributes);
        this.model.save();
    }
});

exports.OptionsView = OptionsView;
