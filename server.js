var winston = require('winston');
var express = require('express');
var app = express();
var https = require('https');
var http = require('http');
var fs = require('fs');
var bodyParser = require('body-parser');
var lti = require('ims-lti');
var kue = require('kue')
  , jobs = kue.createQueue();

var consumer_key = "ABC";
var consumer_secret = "123";
var nodemailer = require("nodemailer");
var exec = require('child_process').exec, child;
var port = 2020; //https port
var http_port = 2019; //http port
var DELIM = "<DELIMITER>";
var delay_ms = 10000;
var promote_ms = 20000;
var promote_limit = 4;
var client_url = "https://www.edx.org/";
var backendURL = "https://erebor.lti.cs.cmu.edu:" + port + "/";
var badges_srcs = [ "http://erebor.lti.cs.cmu.edu/quickhelper/badges/blank.png",
                    "http://erebor.lti.cs.cmu.edu/quickhelper/badges/helper1.png",
                    "http://erebor.lti.cs.cmu.edu/quickhelper/badges/helper2.png",
                    "http://erebor.lti.cs.cmu.edu/quickhelper/badges/helper3.png",
                    "http://erebor.lti.cs.cmu.edu/quickhelper/badges/helper4.png"
                  ];

var options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

// Create an HTTP service.
http.createServer(app).listen(http_port);
// Create an HTTPS service identical to the HTTP service.
https.createServer(options, app).listen(port);


var userLogger      = new (winston.Logger)({   transports: [
    new (winston.transports.Console)(),
    new (winston.transports.File)({ filename: 'logs/user.log' })]});

var helperLogger    = new (winston.Logger)({   transports: [
    new (winston.transports.Console)(),      
    new (winston.transports.File)({ filename: 'logs/helper.log' })]});

var selectionLogger = new (winston.Logger)({   transports: [
    new (winston.transports.Console)(),      
    new (winston.transports.File)({ filename: 'logs/selection.log' })]});

var voteLogger      = new (winston.Logger)({   transports: [
    new (winston.transports.Console)(),     
    new (winston.transports.File)({ filename: 'logs/vote.log' })]});

var clickLogger      = new (winston.Logger)({   transports: [
    new (winston.transports.Console)(),
    new (winston.transports.File)({ filename: 'logs/click.log' })]});


app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,X-CSRFToken');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});


function mailSendingJob (emailList,emailBody){
  
    var job = jobs.create('new job', {
        emailList: emailList,
        emailBody: emailBody
    }).delay(delay_ms).priority('high');

    job
        .on('complete', function (){
            console.log('Job', job.id, 'sending email to', job.data.emailList, 'is done');
        })
        .on('failed', function (){
            console.log('Job', job.id, 'sending email to', job.data.emailList, 'has failed');
        })

    job.save();
}

jobs.promote(promote_ms,promote_limit);

jobs.process('new job', function (job, done){
    /* carry out all the job function here */
    var smtpTransport = nodemailer.createTransport({
        service: "Gmail",
        auth: {
            user: "edxhelperbutton@gmail.com",
            pass: "Bazaar2014CMU"
        }
    });

    smtpTransport.sendMail({
       from: "EdxHelpButton<edxhelperbutton@gmail.com>", // sender address
       to: job.data.emailList, // comma separated list of receivers
       subject: "DAL MOOC Help Request", // Subject line
       html: job.data.emailBody// html body
    }, function(error, response){
           if(error){
               console.log(error);
           }else{
               console.log("Message sent to " + job.data.emailList);
           }
        });

    done && done();

});


app.get('/',function(req, res) {
	
        console.log(req.query);
	
        var postLink = req.query.url;
	postLink = postLink.replace('discussion/','discussion/forum/');
	postLink = postLink.replace('create',req.query.threadId);
	postLink = client_url  + postLink;
	console.log(postLink);
       
        var title  = req.query.title.replace(/"/g,"&#34;").replace(/'/g,"&#39;").replace(/[\u2018\u2019]/g, "&#39;").replace(/[\u201C\u201D]/g,"&#34;").replace(/(?:\r\n|\r|\n)/g, '<br/>');;
        var body   = req.query.body.replace(/"/g,"&#34;").replace(/'/g,"&#39;").replace(/[\u2018\u2019]/g, "&#39;").replace(/[\u201C\u201D]/g,"&#34;").replace(/(?:\r\n|\r|\n)/g, '<br/>');
        var userId = req.query.userId;
 
        

	var helperLists;
	var cm = "\" "+ title + " "+ body +"\"";
        var command = "java -jar OnlineRecom_W5.jar -user " + userId + " -top 3 -content " + cm + " -mode ST"
        exec(command,
	    function (error, stdout, stderr){
	        stdout = stdout.trim();
	        stdout = stdout.replace(/\"/g,'');
	        console.log(stdout);
                var helpers = stdout;
                helpers = helpers.split(";");
	    
		var pictures    = new Array(); 
                var emailList   = new Array(); 
                var isUserName  = new Array(); 
                var helperId    = new Array(); 
                var voting      = new Array(); 
                var descriptions= new Array(); 
                var badges      = new Array(); 
                var temp_badges = new Array();
                var helperName  = new Array(); 
	    	
                var badges_dict = new Object();
            	
            	var idORname             = Math.round(Math.random()); // ST mode
                //var idORname             = 1; //TA mode
            	var realORanonymous      = Math.round(Math.random());
                var relevantORirrelevant = Math.round(Math.random());
                var showBadges           = Math.round(Math.random());
                var showVoting           = Math.round(Math.random());
            
                voting[0] = "";
                voting[1] = "Is this a good question ? ";
                
                var upvote_downvote_button;
                if(voting[showVoting] === ""){
                    upvote_downvote_button  = "";
                }
                else{
                    upvote_downvote_button  = "<a class=\"btn btn-sm btn-success\"href=\"" + backendURL + "vote?yes=1&helperId=<i>helper_id</i>&instanceId=<i>instance_id</i>\">Yes</a>\
		 <a class=\"btn btn-sm btn-danger\"href=\"" + backendURL + "vote?yes=0&helperId<i>helper_id</i>&instanceId=<i>instance_id</i>\">No</a>";
                }

                var badge_bgcolor = "";
                console.log(showBadges);
                if(showBadges > .5){
		    badge_bgcolor = "background-color : steelblue !important;";
                }
                else{
                    badge_bgcolor = "background-color : lightsteelblue !important;";
                }

            	isUserName[0] = "ID: ";
            	isUserName[1] = "Name: "; 

                for(var i=0; i < helpers.length; i++){
                    // userid + "," + user_name + "," + user_email + "," + anonymized photo + "," + real photo + "," + irrelevant description + "," + description + “,” + badge;
                    var info = helpers[i].split(",");
                
                    helperId[i] = new Array();
                    helperId[i][0] = info[0]; // ID
                    helperId[i][1] = info[1]; // Name
                
                    emailList[i] = info[2]; // Email
                
                    pictures[i] = new Array();
                    pictures[i][1] = info[3]; // Anonymous 
                    pictures[i][0] = info[4]; // Real

                    descriptions[i] = new Array();
                    descriptions[i][1] = info[5]; // Irrelevant description
                    descriptions[i][0] = info[6]; // Relevant description
                
                    temp_badges[i] = info[7]; // Badge number
                    badges[i]      = info[7]; // Badge number
                };
            

                temp_badges.sort();
	        for(var i=0; i < helpers.length; i++){	
		    badges_dict[temp_badges[i]] = badges_srcs[i+2];
                    if( temp_badges[i] < 2 ){
		        badges_dict[temp_badges[i]] = badges_srcs[1];
                    } 
                }
            
                for(var i=0; i < helpers.length; i++){
                    var temp = badges[i];
                    badges[i] = new Array();
                    badges[i][0] = badges_srcs[0];
                    badges[i][1] = badges_dict[temp];
                    badges[i][2] = temp;
                }
            
                var instance_id = new Date().getTime() + userId;
 
                var mail_preview =  "<h1>If you choose at least one helper from the helpers listed at the bottom of the page, the system will send a private email message to them with the link to your discussion forum post. This is what the email message will say:</h1>\
   \
    <table border=\"0\" class=\"intro\">\
      <tr>\
        <td>\
          <p>Hello <i>Helper</i></p>\
		  <p>You have been selected as an excellent person to help answer a fellow student question:</p>\
          <table bgcolor=\"#C8C8C8\" class=\"question\">\
            <tr style=\"text-align:center;\">\
              <td><b>" + title + "</b></td>\
            </tr>\
            <tr>\
              <td>" +  body + "</td>\
            </tr>\
          </table>\
		  \
		  \
       <p>" + voting[showVoting] + upvote_downvote_button + "</p>\
		  <p> If you would like to answer this question, please <a href=\"" + postLink + "\">follow this link</a> to the course discussion forums. <BR><BR>  Thank you!   </p>\
		  <p class=\"ahs\"> MOOC Automated Help-Matching System</p>\
		\
        </td>\
      </tr>\
    </table>";

                //var htmlContent = "<html> <head><meta http-equiv=\"Content-Type\" content=\"text/html; charset=ISO-8859-1\"><title>Help Page</title><link rel=\"stylesheet\" type=\"text/css\" href=\"http://erebor.lti.cs.cmu.edu/edx.css\"></head> <body>" + mail_preview + "<h1>These students are good matches for answering you question. Would you like to invite any of these potential helpers to your discussion thread via private message?</h1><form action=\""+backendURL+"candidates\" method=\"get\" ><input type=\"hidden\" name=\"title\" value = \"" + title + "\"><input type=\"hidden\" name=\"instance_id\" value = \"" + instance_id + "\"></input><input type=\"hidden\" name=\"body\" value = \"" + body + "\"></input><input type=\"hidden\" name=\"postLink\" value = \"" + postLink + "\"></input><input type=\"hidden\" name=\"voting\" value = \"" + voting[showVoting] + "\"></input><table border = \"1\"><tr><td><input type=\"checkbox\" name=\"checkbox\" value=\"0," + helperId[0][1] + "," + helperId[0][0] + ","+ emailList[0] + "\"></td><td><h2>" + isUserName[idORname] +helperId[0][idORname]+"</h2><img alt=\"A picture of me\" height=\"120\" width=\"120\" src=\""+pictures[0][realORanonymous]+"\"></td><td><h3>"+descriptions[0][relevantORirrelevant]+"</h3></td>"+"<td><img alt=\"A badge of me\" height=\"120\" width=\"120\" src=\""+badges[0][showBadges]+"\"></td></tr><tr><td><input type=\"checkbox\" name=\"checkbox\" value=\"1," + helperId[1][1] + "," + helperId[1][0] + ","+ emailList[1] + "\"></td><td><h2>" + isUserName[idORname] +helperId[1][idORname]+"</h2><img alt=\"A picture of me\" height=\"120\" width=\"120\" src=\""+pictures[1][realORanonymous]+"\"></td><td><h3>"+descriptions[1][relevantORirrelevant]+"</h3></td>"+"<td><img alt=\"A badge of me\" height=\"120\" width=\"120\" src=\""+badges[1][showBadges]+"\"></td></tr><tr><td><input type=\"checkbox\" name=\"checkbox\" value=\"2," + helperId[2][1] + "," + helperId[2][0] + ","+ emailList[2] + "\"></td><td><h2>" + isUserName[idORname] + helperId[2][idORname]+"</h2><img alt=\"A picture of me\" height=\"120\" width=\"120\" src=\""+pictures[2][realORanonymous]+"\"></td><td><h3>"+descriptions[2][relevantORirrelevant]+"</h3></td>"+"<td><img alt=\"A badge of me\" height=\"120\" width=\"120\" src=\""+badges[2][showBadges]+"\"></td></tr></table><h2>If you select none, your help request will be posted to the course discussion board without sending a private message to any of these potential helpers.</h2><div align=\"center\"><input type=\"submit\" value=\"Submit\"></div></form></body></html>";
               var htmlContent = "<html>\
  <head>\
    <meta http-equiv=\"Content-Type\" content=\"text/html; charset=ISO-8859-1\">\
    <title>Help Page</title>\
    <link rel=\"stylesheet\" type=\"text/css\" href=\"http://erebor.lti.cs.cmu.edu/edx.css\">\
	<link rel=\"stylesheet\" href=\"https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/css/bootstrap.min.css\">\
	<link rel=\"stylesheet\" href=\"https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/css/bootstrap-theme.min.css\">\
	<script src=\"https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/js/bootstrap.min.js\">\</script>\
\
	<style type=\"text/css\">\
		body {\
			font-family : tahoma, arial, sans-serif !important;\
			font-size : 10pt !important;\
		}\
		h1 {\
			font-size : 18px !important;\
			font-weight : bold !important;\
			line-height : 130%;\
		}\
\
		h2 {\
			font-size : 16px !important;\
			font-weight : bold !important;\
			line-height : 130%;\
		}\
 		input[type=checkbox]\
		{\
 		   \
 		    -ms-transform: scale(2); \
 		    -moz-transform: scale(2); \
 		    -webkit-transform: scale(2); \
 		    -o-transform: scale(2); \
 		    padding: 10px;\
		}\
		.intro {\
			width : 95%;\
			margin-left : auto;\
			margin-right : auto;\
			border : 0px;\
			background-color : papayawhip;\
			-webkit-border-radius: 10px;\
			-moz-border-radius: 10px;\
			border-radius: 10px;\
			padding : 10px !important;\
		}\
		.intro td {\
			padding : 10px !important;\
		}	\
		\
		.question {\
			border : 0px;\
			background-color : goldenrod;\
			-webkit-border-radius: 10px;\
			-moz-border-radius: 10px;\
			border-radius: 10px;\
			padding : 10px !important;\
			margin-bottom : 10px;\
			margin-left : 20px;\
		}\
		.question td {\
			padding : 10px !important;\
		}\
		\
		a {\
			color : #232323;\
			text-decoration : underline;\
		}\
		a:hover {\
			color : navy;\
		}\
		\
		body {\
			margin : 10px !important;\
		}\
		\
		.person {\
			width : 95%;\
			margin-left : auto;\
			margin-right : auto;\
			background-color : lightsteelblue;\
			padding : 10px;\
			-webkit-border-radius: 10px !important;\
			-moz-border-radius: 10px !important;\
			border-radius: 10px !important;\
			margin-bottom : 10px;\
		}	\
		\
		.person .select {\
			text-align : center;\
			vertical-align : middle;\
			display : table-cell;\
			width : 5%;\
		}	\
		.person .avatar {\
                        text-align : left;\
			vertical-align : middle;\
			display : table-cell;\
			width : 10%;\
		}	\
		.person .desc {\
			text-align : left;\
			vertical-align : top;\
			font-size : 18px;\
			line-height : 150%;\
			display : table-cell;\
			padding : 10px;\
                        width : 70%;\
		}	\
		.person .badge {\
			text-align : right;\
			vertical-align : middle;\
			display : table-cell;\
			" + badge_bgcolor + "\
			width : 15%;\
		}	\
		\
		.ahs {\
			text-align : right;\
			font-style : italic;\
			padding-right : 16px;\
		}\
		\
		\
	</style>\
	\
  </head>\
  <body>" + mail_preview + "<h1>These students are good matches for answering your question. Would you like to invite any of these potential helpers to your discussion thread via private message?</h1>\
    <form action=\""+backendURL+"candidates\" method=\"get\" >\
      <input type=\"hidden\" name=\"title\" value = \"" + title + "\"><input type=\"hidden\" name=\"instance_id\" value = \"" + instance_id + "\"></input><input type=\"hidden\" name=\"body\" value = \"" + body + "\"></input><input type=\"hidden\" name=\"postLink\" value = \"" + postLink + "\"></input><input type=\"hidden\" name=\"voting\" value =\"" + voting[showVoting] + "\"></input>\
	  \
	  <div class=\"people\">\
	  \
	  	<div class=\"person\">\
			<div class=\"select\">\
				<input type=\"checkbox\" name=\"checkbox\" id=\"" + helperId[0][0] + "\" value=\"0," + helperId[0][1] + "," + helperId[0][0] + ","+ emailList[0] + "\">\
			</div>\
			<div class=\"avatar\">\
				<label for=\"" + helperId[0][0] + "\"><img alt=\"A picture of me\" height=\"120\" width=\"120\" src=\""+pictures[0][realORanonymous]+"\">\
				<div>" + isUserName[idORname] +helperId[0][idORname]+"</div>\</label>\
			</div>\
			<div class=\"desc\">"+descriptions[0][relevantORirrelevant]+"</div>\
			<div class=\"badge\">\
				<img alt=\"A badge of me\" height=\"120\" width=\"120\" src=\""+badges[0][showBadges]+"\">\
			</div>\
		</div>\
	  <div class=\"people\">\
	  \
	  	<div class=\"person\">\
			<div class=\"select\">\
				<input type=\"checkbox\" name=\"checkbox\" id=\"" + helperId[1][0] + "\" value=\"1," + helperId[1][1] + "," + helperId[1][0] + ","+ emailList[1] + "\">\
			</div>\
			<div class=\"avatar\">\
				<label for=\"" + helperId[1][0] + "\"><img alt=\"A picture of me\" height=\"120\" width=\"120\" src=\""+pictures[1][realORanonymous]+"\">\
				<div>" + isUserName[idORname] +helperId[1][idORname]+"</div>\</label>\
			</div>\
			<div class=\"desc\">"+descriptions[1][relevantORirrelevant]+"</div>\
			<div class=\"badge\">\
				<img alt=\"A badge of me\" height=\"120\" width=\"120\" src=\""+badges[1][showBadges]+"\">\
			</div>\
		</div>\
	  <div class=\"people\">\
	  \
	  	<div class=\"person\">\
			<div class=\"select\">\
				<input type=\"checkbox\" name=\"checkbox\" id=\"" + helperId[2][0] + "\" value=\"2," + helperId[2][1] + "," + helperId[2][0] + ","+ emailList[2] + "\">\
			</div>\
			<div class=\"avatar\">\
				<label for=\"" + helperId[2][0] + "\"><img alt=\"A picture of me\" height=\"120\" width=\"120\" src=\""+pictures[2][realORanonymous]+"\">\
				<div>" + isUserName[idORname] +helperId[2][idORname]+"</div>\</label>\
			</div>\
			<div class=\"desc\">"+descriptions[2][relevantORirrelevant]+"</div>\
			<div class=\"badge\">\
				<img alt=\"A badge of me\" height=\"120\" width=\"120\" src=\""+badges[2][showBadges]+"\">\
			</div>\
		</div>\
	  \
	\
      <h2>If you select none, your help request will be posted to the course discussion board without sending a private message to any of these potential helpers.</h2>\
      <div align=\"center\"><input type=\"submit\" value=\"Submit\"></div>\
    </form>\
  </body>\
</html>"; 
                 console.log(htmlContent);

                res.send(req.query.callback+'(\''+htmlContent+'\')');

	        if(error !== null){
	            console.log('exec error: ' + error);
	        }
                else{
                    //Help Seeker User ID, Instance ID, Badge Shown?, Irrelevant Sentence Shown?, Voting Shown?, Anonymized Image Shown?, User ID Shown?, helper0, helper1, helper2, Question title, Question body, Thread url
                    var user_data = DELIM + userId + DELIM + instance_id + DELIM + showBadges + DELIM + relevantORirrelevant + DELIM + showVoting + DELIM + realORanonymous + DELIM + idORname + DELIM + helperId[0][0] + DELIM + helperId[1][0] + DELIM + helperId[2][0] + DELIM + title + DELIM + body + DELIM + postLink + DELIM;
                    userLogger.log('info', user_data);
              
                   //Helper User ID,  Instance ID, Name Shown, Badge URL, # Previous Help Requests (from Diyi’s), Relevant Sentence, Irrelevant Sentence
                  for(var i=0; i < helpers.length; i++){
                      var helper_data = DELIM + helperId[i][0] + DELIM + instance_id + DELIM + helperId[i][1] + DELIM + badges[i][showBadges] + DELIM + badges[i][2] + DELIM + descriptions[i][0] + DELIM + descriptions[i][1] + DELIM;
                      helperLogger.log('info', helper_data);   
                  }
                }
	    });
});


app.get('/candidates',function(req, res) {
        
        console.log(req.query);
   
	if(req.query.checkbox)
	{
             var upvote_downvote_button  = "<a class=\"btn btn-sm btn-success\"href=\"" + backendURL + "vote?yes=1&helperId=<i>helper_id</i>&instanceId=<i>instance_id</i>\">Yes</a>\
		 <a class=\"btn btn-sm btn-danger\"href=\"" + backendURL + "vote?yes=0&helperId=<i>helper_id</i>&instanceId=<i>instance_id</i>\">No</a>"; 
             var voting;
             if(req.query.voting === ""){
                 voting = ""
             }
             else{
                 voting = req.query.voting + upvote_downvote_button;
             }

            var click_url =  backendURL + "click?url=" + req.query.postLink + "&helperId=<i>helper_id</i>&instanceId=<i>instance_id</i>"

            var mail_preview =  "<html>\
    <table border=\"0\" class=\"intro\">\
      <tr>\
        <td>\
          <p>Hello <i>Helper</i></p>\
		  <p>You have been selected as an excellent person to help answer a fellow student question:</p>\
          <table bgcolor=\"#C8C8C8\" class=\"question\">\
            <tr style=\"text-align:center;\">\
              <td><b>" + req.query.title + "</b></td>\
            </tr>\
            <tr>\
              <td>" +  req.query.body + "</td>\
            </tr>\
          </table>\
		  \
		  \
       <p>" + voting + "</p>\
		  <p> If you would like to answer this question, please <a href=\"" + click_url + "\">follow this link</a> to the course discussion forums. <BR><BR>  Thank you!   </p>\
		  <p class=\"ahs\"> MOOC Automated Help-Matching System</p>\
		\
        </td>\
      </tr>\
    </table>";
            var checkboxes = new Array();
            if(req.query.checkbox.length > 4){
            	checkboxes = [req.query.checkbox];
            }
            else{
                checkboxes = req.query.checkbox;
            }

            for(var i=0;i<checkboxes.length;i++){
		var info = checkboxes[i].split(",");
                var mailBody = mail_preview.replace("<i>Helper</i>",info[1]).replace(/instance_id/g,req.query.instance_id).replace(/helper_id/g,info[2]);
                mailSendingJob(info[3],mailBody);
                selectionLogger.log("info",DELIM + req.query.instance_id + DELIM + info[0] + DELIM);
	    };
        
            mailSendingJob("edxhelperbutton@gmail.com",mail_preview);
        }
        else
        {
            selectionLogger.log("info",DELIM + req.query.instance_id + DELIM + "NONE" + DELIM);
        }
        
        res.end("<body onload=\"history.go(-1); setTimeout('self.close()', 0);\">Your help request has been sent to the helper(s) selected by you.</body>");
});

app.get('/vote',function(req, res) {
    console.log(req.query);
    
    // Helper User ID, Timestamp, Instance ID, Upvote/Downvote
    voteLogger.log("info",DELIM + req.query.helperId + DELIM + req.query.instanceId + DELIM + req.query.yes + DELIM);    

    res.end("<body>Your Vote Has Been Registered!</body>");

});

app.get('/click',function(req, res) {

    // Helper User ID, Timestamp, Instance ID, URL clicked
    clickLogger.log("info",DELIM + req.query.helperId + DELIM + req.query.instanceId + DELIM + req.query.url + DELIM);

    res.end("<body onload=\"window.location.href='" + req.query.url +"'\"></body>");

});
console.log("server is running on "+port+"...");
