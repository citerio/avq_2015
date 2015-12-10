'use strict';

// Look after different browser vendors' ways of calling the getUserMedia() API method:
// Opera --> getUserMedia
// Chrome --> webkitGetUserMedia
// Firefox --> mozGetUserMedia
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia 
							|| navigator.mozGetUserMedia;

// Clean-up function:
// collect garbage before unloading browser's window
window.onbeforeunload = function(e){
	hangup();
}

// Data channel information
//var sendChannel, receiveChannel;
var sendButton = document.getElementById("sendButton");
var sendTextarea = document.getElementById("dataChannelSend");
var receiveTextarea = document.getElementById("dataChannelReceive");

// HTML5 <video> elements
var localVideo = document.querySelector('#localVideo');
var remoteVideo1 = document.querySelector('#remoteVideo1');
var remoteVideo2 = document.querySelector('#remoteVideo2');
var remoteVideo3 = document.querySelector('#remoteVideo3');
var remoteVideo4 = document.querySelector('#remoteVideo4');

// Handler associated with 'Send' button
sendButton.onclick = sendData;

// Flags...
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;

// WebRTC data structures
// Streams
var localStream;
var remoteStream;

// Peer Connection array
var users = [];
var conn_count = -1;

// Peer Connection ICE protocol configuration (either Firefox or Chrome)
var pc_config = webrtcDetectedBrowser === 'firefox' ?
  {'iceServers':[{'url':'stun:23.21.150.121'}]} : // IP address
  {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};
  
var pc_constraints = {
  'optional': [
    {'DtlsSrtpKeyAgreement': true}
  ]};

// Session Description Protocol constraints:
var sdpConstraints = {};
/////////////////////////////////////////////

// Let's get started: prompt user for input (room name)
var room = prompt('Enter room name:');

// Connect to signalling server
var host = window.location.hostname; 
var socket = io.connect('http://' + host + ':3000');
//var socket = io.connect("http://localhost:3000");

// Send 'Create or join' message to singnalling server
if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}

// Set getUserMedia constraints
var constraints = {video: true, audio: true};

// From this point on, execution proceeds based on asynchronous events...

/////////////////////////////////////////////

// getUserMedia() handlers...
/////////////////////////////////////////////
function handleUserMedia(stream) {
	localStream = stream;
	attachMediaStream(localVideo, stream);
	console.log('Adding local stream.');
	socket.emit('user incoming', room);
	
}

function handleUserMediaError(error){
	console.log('navigator.getUserMedia error: ', error);
}
/////////////////////////////////////////////


// Server-mediated message exchanging...
/////////////////////////////////////////////

// 1. Server-->Client...
/////////////////////////////////////////////

// Handle 'created' message coming back from server:
// this peer is the initiator
socket.on('created', function (room){
  console.log('Created room ' + room);  
  
  // Call getUserMedia()
  navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);  
  
});

// Handle 'full' message coming back from server:
// this peer arrived too late :-(
socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

// Handle 'join' message coming back from server:
// another peer is joining the channel
socket.on('user incoming', function (user_id){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  conn_count++;
  users[conn_count] = {};
  users[conn_count].myRole = 'initiator';
  users[conn_count].myTarget = user_id;
  users[conn_count].isChannelReady = true;
  createPeerConnection();
  isChannelReady = true;
  doCall();
  
});

// Handle 'joined' message coming back from server:
// this is the second peer joining the channel
socket.on('joined', function (room){
  console.log('This peer has joined room ' + room);
  
  
  // Call getUserMedia()
  navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);
  
});

// Server-sent log message...
socket.on('log', function (array){
  console.log.apply(console, array);
});

// Receive message from the other peer via the signalling server 
socket.on('message', function (message, from_user){
  console.log('Received message:', message);
  
   if (message.type === 'offer') {   
    
	conn_count++;
	users[conn_count] = {};
    users[conn_count].myRole = 'joiner';
    users[conn_count].myTarget = from_user;
	users[conn_count].isChannelReady = true;
    createPeerConnection();
    users[conn_count].pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
	//isChannelReady = false;
	
	
  }
  if (message.type === 'answer') {
    users[conn_count].pc.setRemoteDescription(new RTCSessionDescription(message));
	//isChannelReady = false;
	console.log('ULTIMA SINTAXIS');
	socket.emit('user incoming', room);
		
  }
  if (message.type === 'candidate' && users[conn_count].isChannelReady) {
    var candidate = new RTCIceCandidate({sdpMLineIndex:message.label, candidate:message.candidate});
    users[conn_count].pc.addIceCandidate(candidate);
  }
  if (message === 'bye') {
    handleRemoteHangup();
  }
});
////////////////////////////////////////////////

// 2. Client-->Server
////////////////////////////////////////////////
// Send message to the other peer via the signalling server
function sendMessage(message, target){
  console.log('Sending message: ', message);
  socket.emit('message', message, target);
}
////////////////////////////////////////////////////

////////////////////////////////////////////////////
// Channel negotiation trigger function
function checkAndStart() {
  
  if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {  
	createPeerConnection();
    isStarted = true;
    if (isInitiator) {
      doCall();
    }
  }
}

/////////////////////////////////////////////////////////
// Peer Connection management...
function createPeerConnection() {
  try {
    users[conn_count].pc = new RTCPeerConnection(pc_config, pc_constraints);
    
    console.log("Calling pc.addStream(localStream)! Initiator: " + isInitiator);
	//reattachMediaStream(localVideo, localStream);
    users[conn_count].pc.addStream(localStream);
    var to_user = users[conn_count].myTarget;
    users[conn_count].pc.onicecandidate = function (event) {
      console.log('handleIceCandidate event: ', event);
      if (event.candidate) {
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate}, to_user);
        } else {
               console.log('End of candidates.');
               }
    };
	
    console.log('Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.'); 
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }
  
  //getting remotes streams, MAYBE THIS COULD CHANGE DUE TO DISCONNECTING REMOTE STREAMING
  users[conn_count].pc.onaddstream = function (event) {
      console.log('Remote stream added.');
      if(conn_count == 0){
	    attachMediaStream(remoteVideo1, event.stream);  
	  }
	  if(conn_count == 1){
	    attachMediaStream(remoteVideo2, event.stream);  
	  }
	  if(conn_count == 2){
	    attachMediaStream(remoteVideo3, event.stream);  
	  }
	  if(conn_count == 3){
	    attachMediaStream(remoteVideo4, event.stream);  
	  }

      console.log('Remote stream attached!!.');
      
  };
  
  users[conn_count].pc.onremovestream = handleRemoteStreamRemoved;
  console.log('TIPO DE ROL ' + users[conn_count].myRole);	
  if (users[conn_count].myRole == 'initiator') {
    try {
      // Create a reliable data channel
      users[conn_count].sendChannel = users[conn_count].pc.createDataChannel("sendDataChannel", {reliable: true});
      trace('Created send data channel');
    } catch (e) {
      alert('Failed to create data channel. ');
      trace('createDataChannel() failed with exception: ' + e.message);
    }
	
	//data channel events 
	if(conn_count == 0){
	    users[0].sendChannel.onopen = handleSendChannelStateChange1;
		users[0].sendChannel.onclose = handleSendChannelStateChange1;
		users[0].sendChannel.onmessage = handleMessage;
	  }
	if(conn_count == 1){
	    users[1].sendChannel.onopen = handleSendChannelStateChange2;
		users[1].sendChannel.onclose = handleSendChannelStateChange2;
		users[1].sendChannel.onmessage = handleMessage;
	  }  
	if(conn_count == 2){
	    users[2].sendChannel.onopen = handleSendChannelStateChange3;
		users[2].sendChannel.onclose = handleSendChannelStateChange3;
		users[2].sendChannel.onmessage = handleMessage;
	  }  
    
	if(conn_count == 3){
	    users[3].sendChannel.onopen = handleSendChannelStateChange4;
		users[3].sendChannel.onclose = handleSendChannelStateChange4;
		users[3].sendChannel.onmessage = handleMessage;
	  }  
		
    
    
  } else { // Joiner
          
          console.log('TIPO DE ROL ' + users[conn_count].myRole);		  
          
          
		  
		  if(conn_count == 0){
		    
            			
		    users[0].pc.ondatachannel = function (event) {
			
			    trace('Receive Channel Callback');
                users[0].receiveChannel = event.channel;
				users[0].receiveChannel.onopen = handleReceiveChannelStateChange1;
		        users[0].receiveChannel.onclose = handleReceiveChannelStateChange1;
			    users[0].receiveChannel.onmessage = handleMessage;
			
			};
		 }  
	        
	      if(conn_count == 1){
		    
            			
		    users[1].pc.ondatachannel = function (event) {
			
			    trace('Receive Channel Callback');
                users[1].receiveChannel = event.channel;
				users[1].receiveChannel.onopen = handleReceiveChannelStateChange2;
		        users[1].receiveChannel.onclose = handleReceiveChannelStateChange2;
			    users[1].receiveChannel.onmessage = handleMessage;
			
			};
		 }
		 
		  if(conn_count == 2){
		    
            			
		    users[2].pc.ondatachannel = function (event) {
			
			    trace('Receive Channel Callback');
                users[2].receiveChannel = event.channel;
				users[2].receiveChannel.onopen = handleReceiveChannelStateChange3;
		        users[2].receiveChannel.onclose = handleReceiveChannelStateChange3;
			    users[2].receiveChannel.onmessage = handleMessage;
			
			};
		}
		  
		  if(conn_count == 3){
		    
            			
		    users[3].pc.ondatachannel = function (event) {
			
			    trace('Receive Channel Callback');
                users[3].receiveChannel = event.channel;
				users[3].receiveChannel.onopen = handleReceiveChannelStateChange4;
		        users[3].receiveChannel.onclose = handleReceiveChannelStateChange4;
			    users[3].receiveChannel.onmessage = handleMessage;
			
			};
          }
          
        }
  }

// Data channel management
function sendData() {

  var data = sendTextarea.value;
  
  for (var i = 0; i < users.length; i++) {
  
     if(users[i].myRole === 'initiator'){
	    users[i].sendChannel.send(data)
	 }else{ 
	    users[i].receiveChannel.send(data); 
     }
	 trace('Sent data: ' + data);
  
  }
}

// Handlers...

function gotReceiveChannel(event) {
  trace('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = handleMessage;
  receiveChannel.onopen = handleReceiveChannelStateChange;
  receiveChannel.onclose = handleReceiveChannelStateChange;
}

function handleMessage(event) {
  trace('Received message: ' + event.data);
  receiveTextarea.value += event.data + '\n';
}

function handleSendChannelStateChange1() {
  var readyState = users[0].sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function handleSendChannelStateChange2() {
  var readyState = users[1].sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function handleSendChannelStateChange3() {
  var readyState = users[2].sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function handleSendChannelStateChange4() {
  var readyState = users[3].sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function handleReceiveChannelStateChange1() {
  var readyState = users[0].receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
	    dataChannelSend.disabled = false;
	    dataChannelSend.focus();
	    dataChannelSend.placeholder = "";
	    sendButton.disabled = false;
	  } else {
	    dataChannelSend.disabled = true;
	    sendButton.disabled = true;
	  }
}

function handleReceiveChannelStateChange2() {
  var readyState = users[1].receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
	    dataChannelSend.disabled = false;
	    dataChannelSend.focus();
	    dataChannelSend.placeholder = "";
	    sendButton.disabled = false;
	  } else {
	    dataChannelSend.disabled = true;
	    sendButton.disabled = true;
	  }
}

function handleReceiveChannelStateChange3() {
  var readyState = users[2].receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
	    dataChannelSend.disabled = false;
	    dataChannelSend.focus();
	    dataChannelSend.placeholder = "";
	    sendButton.disabled = false;
	  } else {
	    dataChannelSend.disabled = true;
	    sendButton.disabled = true;
	  }
}

function handleReceiveChannelStateChange4() {
  var readyState = users[3].receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
	    dataChannelSend.disabled = false;
	    dataChannelSend.focus();
	    dataChannelSend.placeholder = "";
	    sendButton.disabled = false;
	  } else {
	    dataChannelSend.disabled = true;
	    sendButton.disabled = true;
	  }
}

// ICE candidates management
function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    console.log('End of candidates.');
  }
}

// Create Offer
function doCall() {
  console.log('Creating Offer...');
  users[conn_count].pc.createOffer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

// Signalling error handler
function onSignalingError(error) {
	console.log('Failed to create signaling message : ' + error.name);
}

// Create Answer
function doAnswer() {
  console.log('Sending answer to peer.');
  users[conn_count].pc.createAnswer(setLocalAndSendMessage, onSignalingError, sdpConstraints);  
}

// Success handler for both createOffer()
// and createAnswer()
function setLocalAndSendMessage(sessionDescription) {
  
  console.log('Valor de contador conn_count ' + conn_count); 
  users[conn_count].pc.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription, users[conn_count].myTarget);
  
}

/////////////////////////////////////////////////////////
// Remote stream handlers...

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  attachMediaStream(remoteVideo, event.stream);
  console.log('Remote stream attached!!.');
  remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}
/////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////
// Clean-up functions...

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye', 'bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  
    for (var i = 0; i < users.length; i++) {
  
     if(users[i].role === 'initiator'){
	    users[i].role = '';
	 }
  
    }

}

function stop() {
  //isStarted = false;
    for (var i = 0; i < users.length; i++) {
  
        if(users[i].sendChannel){
	       users[i].sendChannel.close();
	    }
		
		if(users[i].receiveChannel){
	       users[i].receiveChannel.close();
	    }
		
		if(users[i].pc){
	       users[i].pc.close();
		   users[i].pc = null;
	    }
  
    }
    
  
  sendButton.disabled=true;
}

///////////////////////////////////////////
