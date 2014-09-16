var databaseUrl = "alertingDB";
var collections = ["settings"];
var db = require("mongojs").connect(databaseUrl, collections);
var assert = require("assert"),
    redisPubSub = require("node-redis-pubsub-fork"),
    pubsubChannel = new redisPubSub({ scope: "messages" }),
    timers = require("timers");
require("../alerting.js");
var CronJob = require('cron').CronJob;
var moment = require('moment');
moment().format();

after(function(){
    db.settings.drop();
});

var newJob;

after(function() {
    newJob.stop();
});
      
describe("test alerting", function() {  

    it('doesn\'t try and send an email if no email address is configured', function(done) {
        this.timeout(7000);
        var success = true;
        pubsubChannel.once("alerting:*", function(data){
            success = false;
        });
        setTimeout(function() {
            if (success) done();
        }, 4000);
        
        pubsubChannel.emit("healthcheck:failed", {name: "testService", url: "testUrl", expectedResBody: "testExpectedResBody", actualResBody: "testActualResBody", expectedResStatus: "testExpectedResStatus", actualResStatus: "actualResStatus", result: "failing", time: moment() });
    });
    
    it('allows services to have individual profiles', function(done){
      this.timeout(7000);
      pubsubChannel.onceIf("alerting:saveResult", function(data) {
        db.settings.find({"name":data.name}).toArray(function(err, result) {
            if (data.name == result[0].name) { done(); }
        });
      }, "failed", null);     
        
      pubsubChannel.emit("alerting:saveInfo", {name: "testService", emails: ["sea.microservices2@gmail.com", "sea.microservices@gmail.com"], frequency: "10"});
    });
    
    it('allows querying of alert settings by service name', function(done) {
        this.timeout(7000);
        pubsubChannel.once("alerting:queryAlertingResult", function(data) {
            db.settings.find({"name": "testService"}).toArray(function(err, result) {
                console.log(result);
                    if (err || !result) {
                        console.log("No alerting job found.");
                    } else {
                        assert.equal(result[0].name, data.name);
                        assert.equal(result[0].emails[0], data.alertSettings[0].emails[0]);
                        assert.equal(result[0].emails[1], data.alertSettings[0].emails[1]);
                        assert.equal(result[0].frequency, data.alertSettings[0].frequency);
                        done();
                    }
                });
        });
        pubsubChannel.emit("alerting:queryAlerting", {name: "testService"});
    });
    
    it('sends email on receipt of healthcheck:failed message', function(done){
        this.timeout(7000);
        pubsubChannel.once("alerting:sent", function(data){
            done();
        });
        
        pubsubChannel.emit("healthcheck:failed", {name: "testService", url: "testUrl", expectedResBody: "testExpectedResBody", actualResBody: "testActualResBody", expectedResStatus: "testExpectedResStatus", actualResStatus: "actualResStatus", result: "failing", time: moment()});  
    });
    
    it('sends multiple emails according to frequency set, not healthcheck frequency', function(done) {
        this.timeout(32000);
        
        var sentEmails = 0;
        
        pubsubChannel.on("alerting:sent", function(data) {
            sentEmails ++;
            if(sentEmails >= 2) {
                done();
            }
        });
        newJob = new CronJob("*/5 * * * * *", function(){
            pubsubChannel.emit("healthcheck:failed", {name: "testService", url: "testUrl", expectedResBody: "testExpectedResBody", actualResBody: "testActualResBody", expectedResStatus: "testExpectedResStatus", actualResStatus: "actualResStatus", result: "failing", time: moment()}); 
        }, null, true);
    });
                                                                             
    it('allows updating of entries in the alerts database', function(done) {
        this.timeout(7000);        
        pubsubChannel.onceIf("alerting:saveResult", function(data) {
            db.settings.find({"name":data.name}).toArray(function(err,result) {
                console.log(data);
                console.log(result);
                if (data.name == result[0].name && equals(data.emails, result[0].emails)) { done(); }
            });
        }, "failed", null);
        pubsubChannel.emit("alerting:saveInfo", {name: "testService", emails: [], frequency: "1"});
    });
    
    it('sends failed message on receipt of healthcheck:failed message with invalid saved email', function(done) {
        this.timeout(7000);
        pubsubChannel.once("alerting:failed", function(data){
            done();
        });
        pubsubChannel.emit("alerting:saveInfo", {name: "testService", emails: ["foo"], frequency: "1"});
        pubsubChannel.onceIf("alerting:saveResult", function(data) {
            pubsubChannel.emit("healthcheck:failed", {name: "testService", url: "testUrl", expectedResBody: "testExpectedResBody", actualResBody: "testActualResBody", expectedResStatus: "testExpectedResStatus", actualResStatus: "actualResStatus", result: "failing", time: moment()});
        }, "failed", null);
    });
    
});




// Copied from REFERENCE [36] J. Vincent, comment on "Object comparison in JavaScript [duplicate]", StackOverflow, Available: http://stackoverflow.com/questions/1068834/object-comparison- in-javascript
function equals ( x, y ) {
    // If both x and y are null or undefined and exactly the same
    if ( x === y ) {
        return true;
    }

    // If they are not strictly equal, they both need to be Objects
    if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) {
        return false;
    }

    // They must have the exact same prototype chain, the closest we can do is
    // test the constructor.
    if ( x.constructor !== y.constructor ) {
        return false;
    }

    for ( var p in x ) {
        // Inherited properties were tested using x.constructor === y.constructor
        if ( x.hasOwnProperty( p ) ) {
            // Allows comparing x[ p ] and y[ p ] when set to undefined
            if ( ! y.hasOwnProperty( p ) ) {
                return false;
            }

            // If they have the same strict value or identity then they are equal
            if ( x[ p ] === y[ p ] ) {
                continue;
            }

            // Numbers, Strings, Functions, Booleans must be strictly equal
            if ( typeof( x[ p ] ) !== "object" ) {
                return false;
            }

            // Objects and Arrays must be tested recursively
            if ( !equals( x[ p ],  y[ p ] ) ) {
                return false;
            }
        }
    }

    for ( p in y ) {
        // allows x[ p ] to be set to undefined
        if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) ) {
            return false;
        }
    }
    return true;
}
