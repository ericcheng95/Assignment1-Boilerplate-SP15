//dependencies for each module used
var express = require('express');
var passport = require('passport');
var InstagramStrategy = require('passport-instagram').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var http = require('http');
var path = require('path');
var handlebars = require('express-handlebars');
var bodyParser = require('body-parser');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var dotenv = require('dotenv');
var Instagram = require('instagram-node-lib');
var Facebook = require('fbgraph');
var mongoose = require('mongoose');
var app = express();

//local dependencies
var models = require('./models');

//client id and client secret here, taken from .env
dotenv.load();
var INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
var INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
var INSTAGRAM_CALLBACK_URL = process.env.INSTAGRAM_CALLBACK_URL;
var INSTAGRAM_ACCESS_TOKEN = "";
Instagram.set('client_id', INSTAGRAM_CLIENT_ID);
Instagram.set('client_secret', INSTAGRAM_CLIENT_SECRET);

var FACEBOOK_CLIENT_ID = process.env.FACEBOOK_APP_ID;
var FACEBOOK_CLIENT_SECRET = process.env.FACEBOOK_APP_SECRET;
var FACEBOOK_CALLBACK_URL = process.env.FACEBOOK_CALLBACK_URL;
var FACEBOOK_ACCESS_TOKEN = "";

//connect to database
mongoose.connect(process.env.MONGODB_CONNECTION_URL);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
  console.log("Database connected succesfully.");
});

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Instagram profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the InstagramStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Instagram
//   profile), and invoke a callback with a user object.
passport.use(new InstagramStrategy({
    clientID: INSTAGRAM_CLIENT_ID,
    clientSecret: INSTAGRAM_CLIENT_SECRET,
    callbackURL: INSTAGRAM_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    models.User.findOrCreate({
      "name": profile.username,
      "id": profile.id,
      "access_token": accessToken 
    }, function(err, user, created) {
      
      // created will be true here
      models.User.findOrCreate({}, function(err, user, created) {
        // created will be false here
        process.nextTick(function () {
          // To keep the example simple, the user's Instagram profile is returned to
          // represent the logged-in user.  In a typical application, you would want
          // to associate the Instagram account with a user record in your database,
          // and return that user instead.
          return done(null, profile);
        });
      })
    });
  }
));

passport.use(new FacebookStrategy({
  clientID: FACEBOOK_CLIENT_ID,
  clientSecret: FACEBOOK_CLIENT_SECRET,
  callbackURL: FACEBOOK_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    models.User.findOrCreate({
      "name": profile.username,
      "id": profile.id,
      "access_token": accessToken
    }, function(err, user, created) {

      models.User.findOrCreate({},function(err, user, created) {
        if (err) {return done (err); }
        done(null, user);
      })
    });
    Facebook.setAccessToken(accessToken);
    /*Facebook.get("/me", function(err, data){console.log(data.name);
    });*/
  }
));

//Configures the Template engine
app.engine('handlebars', handlebars({defaultLayout: 'layout'}));
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({ secret: 'keyboard cat',
                  saveUninitialized: true,
                  resave: true}));
app.use(passport.initialize());
app.use(passport.session());

//set environment ports and start application
app.set('port', process.env.PORT || 3000);

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { 
    return next(); 
  }
  res.redirect('/login');
}

function ensureAuthenticatedInstagram(req, res, next) {
  if (req.isAuthenticated()) { 
    return next(); 
  }
  res.redirect('/instagramlogin');
}

function ensureAuthenticatedFacebook(req,res,next) {
  if (req.isAuthenticated()) { 
    return next(); 
  }
  res.redirect('/facebooklogin');
}

//routes
app.get('/', function(req, res){
  res.render('login');
});

app.get('/instagramlogin', function(req, res){
  res.render('instagramlogin', { user: req.user });
});

app.get('/facebooklogin', function(req,res){
  res.render('facebooklogin', { user: req.user });
});

app.get('/instagramaccount', ensureAuthenticatedInstagram, function(req, res){
  res.render('instagramaccount', {user: req.user});
});

/*app.get('/facebookaccount', ensureAuthenticated, function(req,res){
  //Facebook.setAccessToken(req.user.access_token);
  //Facebook.get("/me", function(err, data){console.log(data.first_name);
    });
  Facebook.get('/me', function(err, data){
    console.log(data);
    res.render('facebookaccount', {user: data});
  });
});*/

app.get('/instagramphotos', ensureAuthenticatedInstagram, function(req, res){
  var query  = models.User.where({ name: req.user.username });
  query.findOne(function (err, user) {
    if (err) return handleError(err);
    if (user) {
      // doc may be null if no document matched
      Instagram.users.liked_by_self({
        access_token: user.access_token,
        complete: function(data) {
          //Map will iterate through the returned data obj
          var imageArr = data.map(function(item) {
            //create temporary json object
            tempJSON = {};
            tempJSON.url = item.images.low_resolution.url;
            if (item.caption)
              tempJSON.caption = item.caption.text;
            //insert json object into image array
            return tempJSON;
          });
          res.render('instagramphotos', {user: req.user, photos: imageArr});
        }
      }); 
    }
  });
});

app.get('/facebookphotos', ensureAuthenticatedFacebook, function(req, res){
  var query  = models.User.where({ name: req.user.username });
  query.findOne(function (err, user) {
    if (err) return handleError(err);
    if (user) {
      Facebook.setAccessToken(req.user.access_token);
      // doc may be null if no document matched
      Facebook.user.photos({
        access_token: user.access_token,
        complete: function(data) {
          //Map will iterate through the returned data obj
          var imageArr = data.map(function(item) {
            //create temporary json object
            tempJSON = {};
            tempJSON.url = item.images.low_resolution.url;
            //insert json object into image array
            return tempJSON;
          });
          res.render('facebookphotos', {photos: imageArr});
        }
      }); 
    }
  });
});

// GET /auth/instagram
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Instagram authentication will involve
//   redirecting the user to instagram.com.  After authorization, Instagram
//   will redirect the user back to this application at /auth/instagram/callback
app.get('/auth/instagram',
  passport.authenticate('instagram'),
  function(req, res){
    // The request will be redirected to Instagram for authentication, so this
    // function will not be called.
  });

app.get('/auth/facebook',
  //passport.authenticate('facebook', {scope: ['email, user_about_me, user_birthday']}),
  function(req, res){
    if (!req.query.code) {
      var authUrl = Facebook.getOauthUrl({
        'client_id': process.env.FACEBOOK_APP_ID,
        //'redirect_uri': 'http://localhost:3000/auth/facebook',
        'redirect_uri': 'http://b7chenglab1.herokuapp.com/auth/facebook',
        //'scope': ['email', 'user_about_me', 'user_photos', 'user_birthday']
      });

      if (!req.query.error) {
        res.redirect(authUrl);
      } else {
        res.send('access denied');
      }
      return;
    }

    Facebook.authorize({
      "client_id": process.env.FACEBOOK_APP_ID,
      //"redirect_uri": 'http://localhost:3000/auth/facebook',
      "redirect_uri": 'http://b7chenglab1.herokuapp.com/auth/facebook',
      "client_secret": process.env.FACEBOOK_APP_SECRET,
      "code": req.query.code
    }, function(err, facebookRes) {
      res.redirect('/UserHasLoggedIn');
    });
  });

app.get('/UserHasLoggedIn', function(req, res) {
  Facebook.get('me', function(err, response) {
    //console.log(err); //if there is an error this will return a value
    data = { facebookData: response};
    res.render('facebookaccount', data);
  });
});

// GET /auth/instagram/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/instagram/callback', 
  passport.authenticate('instagram', { failureRedirect: '/instagramlogin'}),
  function(req, res) {
    res.redirect('/instagramphotos');
  });

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', {failureRedirect: '/facebooklogin'}),
  function(req, res) {
    Facebook.setAccessToken(req.user.access_token);
    res.redirect('/facebookaccount');
  }
);

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

http.createServer(app).listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});
