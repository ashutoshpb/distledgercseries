'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");
var datetime = require('node-datetime'); // for date time/now calculations
var past = '2015-01-01 00:00:00';
var pastDateTime = datetime.create(past);
var genesistime = pastDateTime.now();

var fs = require('fs');//for writing to the file


var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

var deviceid = process.env.DEVICEID;

class Block {
    constructor(index, previousHash, timestamp, data, hash, deviceid) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
        //@berserker
        this.deviceid = deviceid;
    }
}

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

var getGenesisBlock = () => {
    return new Block(0, "0", 1465154705, "genesisiseneg blockkcolb a la BERSERKER", "347538475dlfkjgflkgjg959568fgsgf459435743825244852745dsflfdsjkf8", deviceid);
	//816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7
};

var blockchain = [getGenesisBlock()];

var initHttpServer = () => {
    var app = express();
	app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());
    app.get('/', (req, res) => {
		res.writeHead(200, {'Content-Type': 'text/html'});
		//res.write('Latest hash is: ' + JSON.stringify(getLatestBlock().hash));
		res.write(mainFormHTML());
		//console.log(mainFormHTML());
		res.send();
		
	}); // get '/' ends here
	app.get('/blocks', (req, res) => {
		res.writeHead(200, {'Content-Type': 'text/html'});
		//res.write('Latest hash is: ' + JSON.stringify(getLatestBlock().hash));
		res.write(mainFormHTML());
		res.write(getBlocksAsHTML(blockchain));
		res.send();
	});
	app.post('/mineBlock', (req, res) => {
		//console.log("\nDATA to be added: " + req.body);
        var newBlock = generateNextBlock(req.body.data);
        addBlock(newBlock);
        broadcast(responseLatestMsg());
        console.log('block added: ' + JSON.stringify(newBlock));
		// build the form
		res.writeHead(200, {'Content-Type': 'text/html'});
		//res.write('Latest hash is: ' + JSON.stringify(getLatestBlock().hash	));
		res.write(mainFormHTML());
		res.write(getBlocksAsHTML(blockchain));
		saveBlockchain(); // added by berserker
		res.send();
    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};


var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);

};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

//@berserker
var saveBlockchain = () => {
	// create a file object
	// write the blockchain to the file
	// close the file
	// file name = current time stamp		
	fs.writeFile('csdchain-device-'+ deviceid + '-created-' + genesistime +'.json', JSON.stringify(blockchain), (err) => {
		if (err) throw err;
		console.log('The file has been saved!');
	});
}

var getBlocksAsHTML = (blockchain) => {
	var htmlString = '<table><tr><th>#</th><th>DEVICE ID</th><th> INFORMATION</th><th>TIMESTAMP</th><th>HASH</th></tr>';
	//console.log('inside getBlocksAsHTML' + JSON.stringify(blockchain));
	for(var i = 0; i < blockchain.length; i++){
		console.log(blockchain[i]);
		htmlString = htmlString + '<tr><td>' + blockchain[i].index + '</td><td>'+ blockchain[i].deviceid +'</td><td>' + blockchain[i].data + '</td><td>' + blockchain[i].timestamp + '</td><td>' + blockchain[i].hash + '</td></tr>';
	}
	return htmlString + '</html>';
}

var mainFormHTML = () => {
		
		//var mainFormHTMLString = '<form action="mineBlock" method="post">'; 
		var mainFormHTMLString = '<html><head><style>th {height: 50px; background-color:66ccff} table{width: 100%;} tr:nth-child(even) {background-color: #f2f2f2} </style> </head> <body>';
		mainFormHTMLString = mainFormHTMLString +'<form>'; 
		mainFormHTMLString = mainFormHTMLString + 'Current hash is: ';
		mainFormHTMLString = mainFormHTMLString + JSON.stringify(blockchain[blockchain.length - 1].hash);
		mainFormHTMLString = mainFormHTMLString + '<br><br><br><input type="text" name="data"/>';
		mainFormHTMLString = mainFormHTMLString + '<button type="submit" formaction="/mineBlock" formmethod="post">Add data to the chain</button>';
		mainFormHTMLString = mainFormHTMLString + '<button type="submit" formaction="/blocks" formmethod="get">Refresh Txn List</button>';		
		mainFormHTMLString = mainFormHTMLString + '</form></body>';

		return mainFormHTMLString;
}

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};


var generateNextBlock = (blockData) => {
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = new Date().getTime() / 1000;
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash, deviceid);
};


var calculateHashForBlock = (block) => {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

var calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString(); // this is where the chaining happens
};

var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};

var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = (message) => {
    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than received blockchain. Do nothing');
    }
};

var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid');
    }
};

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();
