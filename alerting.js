var databaseUrl = "alertingDB";
var collections = ["settings"];
var db = require("mongojs").connect(databaseUrl, collections);
var redisPubSub = require("node-redis-pubsub-fork"),
    pubsubChannel = new redisPubSub({ scope: "messages" });
var moment = require('moment');
moment().format();

var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: 'sea.microservices@gmail.com',
            pass: 'testalerting'
        }
    });

var emailTracker = {};

pubsubChannel.on("healthcheck:failed", function(data) {

    db.settings.find({"name": data.name}).toArray(function(err, result) {
        if(!err && result.length > 0 && result[0].emails.length > 0) {
            if((emailTracker[data.name] == null) || (moment(data.time).diff(emailTracker[data.name], 'seconds') >= result[0].frequency)) {
                // setup e-mail data with unicode symbols
                var mailOptions = {
                    from: 'SEA Microservices <sea.microservices@gmail.com>', // sender address
                    to: result[0].emails.toString(), // list of receivers
                    subject: "Microservice " + data.name + " failure!", // Subject line
                    text: 'The microservice '+ data.name + ' is failing its healthchecks!', // plaintext body
                };
                // send mail with defined transport object
                transporter.sendMail(mailOptions, function(error, info){
                    if(error) {
                        pubsubChannel.emit("alerting:failed", {name: data.name, message: "Warning email for " + data.name + " failed to send."});
                        console.log(error);
                    } else{
                        pubsubChannel.emit("alerting:sent", {name: data.name, message: "email sent"});
                        console.log('Message sent: ' + info.response);
                        emailTracker[data.name] = moment();
                    }
                }); 
            }
        } else {
            console.log("No alerts data found");
        }       
    });

});

pubsubChannel.on("alerting:saveInfo", function(data) {
    db.collection("settings").update(
        { name: data.name },
        { name: data.name, emails: data.emails, frequency: data.frequency },
        { upsert: true },
        function(err, object) {
            if (err) {
                console.warn(err.message);
                data.failed = "true";
                pubsubChannel.emit("alerting:saveResult", data);
            } else {
                console.log("Alerts entry saved successfully");
                pubsubChannel.emit("alerting:saveResult", data);
            }
        }
    );
});

pubsubChannel.on("alerting:queryAlerting", function(data) {
    db.settings.find({"name": data.name}).toArray(function(err, queryAlertRes) {
        if (!err) {
            pubsubChannel.emit("alerting:queryAlertingResult", {"name": data.name, "alertSettings": queryAlertRes});
        }
        else {
            pubsubChannel.emit("alerting:queryAlertingResult", {"name": data.name, "alertSettings": []});
        }
    });
});
