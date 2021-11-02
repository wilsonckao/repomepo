#!/bin/bash

if [ "$ENABLE_DEBUG" == "true" ]; then
	echo "Starting with debugger on port 80"
	exec with_ngrok node --debug=80 index.js
else
	echo "Starting without debugger"
	exec node index.js
fi
