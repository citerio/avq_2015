//var static = require('node-static');
//var http = require('http');
var port = 3000;
// Create a node-static server instance
//var file = new(static.Server)();

// We use the http moduleÕs createServer function and
// rely on our instance of node-static to serve the files
/*var app = http.createServer(function (req, res) {
  file.serve(req, res);
});*/

// Use socket.io JavaScript library for real-time web applications
var io = require('socket.io').listen(port);

/*io.listen(port, function() {
  console.log("server socket.io (port "+port+")");
});*/

// Let's start managing connections...
var users = [];
var currentuser;
var index = -1;

io.sockets.on('connection', function (socket){
	
    	// Handle 'message' messages
        socket.on('message', function (message, target) {
                log('S --> got message: ', message);
                // channel-only broadcast...
                io.sockets.socket(target).emit('message', message, socket.id);
        });
        
        // Handle 'create or join' messages
        socket.on('create or join', function (room) {
                var numClients = io.sockets.clients(room).length;

                log('S --> Room ' + room + ' has ' + numClients + ' client(s)');
                log('S --> Request to create or join room', room);

                // First client joining...
                if (numClients == 0){
                        socket.join(room);
						currentuser = socket.id;
						//users.push(socket.id);
						log('socked id:' + socket.id);
                        socket.emit('created', room);
                } else if (numClients > 0 ) {
                // Second client joining...                	
                        //io.sockets.in(room).emit('join', room);
						socket.join(room);
						currentuser = socket.id;
						log('socked id:' + socket.id);
						socket.emit('joined', room);											
                        
                } else { // max two clients
                        socket.emit('full', room);
                }
        });
		
		// Handle new incoming user
        socket.on('user incoming', function (room) {
                
				index++;
				if(index < users.length){
				
				    log('llamando a usuario ' + users[index]);							
					io.sockets.socket(users[index]).emit('user incoming', currentuser);
				
				}else{
				    users.push(currentuser);
					index = -1;
				}
				
				/*for (var i = 0; i < users.length; i++) {
				
					log('llamando a usuario ' + users[i]);							
					io.sockets.socket(users[i]).emit('user incoming', socket.id);							
                }*/
						
					
        });
        
        function log(){
            var array = [">>> "];
            for (var i = 0; i < arguments.length; i++) {
            	array.push(arguments[i]);
            }
            socket.emit('log', array);
        }
});
