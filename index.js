const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const axios = require('axios');

const port = process.env.PORT || 80;

// LANDBOT APIChatbot details
const landbot_token = "0QDQRI7EXDFT77DV" // Landbot API Channel TOKEN 
const landbot_url = "https://chat.landbot.io/v1/send" // Landbot API base url

// OTHER PLATFORM API details, in this case Telegram
const telegram_bot_id = "2051686212:AAHYt4RLC8u9QLA4-l1DMOCBJrvUvKM99ls"  //Bot id given by the botfather
const telegram_url = "https://api.telegram.org/bot" // Telegram API base url

//configurations
app.use(bodyParser.json());

//Listening
app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})

/**
 * Capture requests from Landbot, sample url: https://<your hook url>/landbot_hook
 */

app.get('/', function (req, res) {
    res.send("hello")
})

app.post('/landbot_hook', function (req, res) {
   
    try {
        res.json({title: "sucess"})
        const bodyMessage = req.body;

        //Capture and gather message request from Landbot and store it in a body for later use

        let messageObject = {};

        messageObject.message = bodyMessage.messages[0].message;
        messageObject.type = bodyMessage.messages[0].type || "text"
        messageObject.timestamp = bodyMessage.messages[0].timestamp
        messageObject.chat_id = bodyMessage.customer.token
        messageObject.media = bodyMessage.messages[0].url || "null"
        messageObject.contentButton = bodyMessage.messages[0].title || "null"

        messageObject.buttons = "buttons" in bodyMessage.messages[0] ? bodyMessage.messages[0].buttons : undefined
        messageObject.payloads = "buttons" in bodyMessage.messages[0] ? bodyMessage.messages[0].payloads : undefined
        messageObject.button_message = "buttons" in bodyMessage.messages[0] ? bodyMessage.messages[0].title : undefined

        //Add object with data to Qeue for later to be sent

        arrayQeue.push(messageObject)

        //Trigger the sending of the messages in the qeue delayed
        //Bear in mind that Landbot if needed will send one or a squence of messages in a brief period of time
        //For that reason is given few seconds, to add messages to the qeue and then trigger the message to the other platform

        setTimeout(function () {
            sendQeueContent()
        }, 3000)
    } catch (e) {
        console.log(e)
    }
})

//arrayQeue is where we will store the messages coming from Landbot Hook. 
//It needs to hold temporarily the messages, as messages will come as sequences  

let arrayQeue = []

//Triggering sendQeueContent will:
//1 - Capture messages in the qeue
//2 - Empty qeue, so we don't duplicate messages and empty the qeue
//3 - Trigger delayLoop to send messages to other platform to keep order of messages

const sendQeueContent = () => {

    //1 - Capture messages in the qeue

    let currentMessagesToSend = arrayQeue;

    //2 -Empty qeue, so we don't duplicate messages and empty the qeue

    arrayQeue = [];

    // delayLoop: if we send without a delay all messages we will suffer disorder of messages in the other platform 

    let index = 0;
    let delayArr = currentMessagesToSend.length

    function delayLoop() {

        setTimeout(function () {

            //Sort messages based on timestamp. Landbot cannot guarantee messages to be sent to your hook in order.
            //Therefore once you have the messages from the qeue, set order before they are sent to other platform.
            //Long sequences (more than 6 messages) in a row until it stops with a user input might fail

            currentMessagesToSend.sort((a, b) => a.timestamp - b.timestamp)

            // Preparse messages to be sent to other platform API
            // Below is the case for TELEGRAM

            let sourceMedia = currentMessagesToSend[index].media;
            let message = currentMessagesToSend[index].message
            let chat_id = currentMessagesToSend[index].chat_id

            let type = currentMessagesToSend[index].type;

            //Based on type of content needed to be sent to other platform, we will use API accordingly

            let telegramRequest = {};
            if (type == "text") {  // SEND TEXT MESSAGE
                telegramRequest.url = `${telegram_url}${telegram_bot_id}/sendMessage`;
                telegramRequest.body = { chat_id: chat_id, text: message };
            } else if (type == "image" && !sourceMedia.includes(".gif")) { // SEND PICTURE
                telegramRequest.url = `${telegram_url}${telegram_bot_id}/sendPhoto`;
                telegramRequest.body = { chat_id: chat_id, photo: sourceMedia };
            } else if (type == "image" && sourceMedia.includes(".gif")) { // SEND GIF
                telegramRequest.url = `${telegram_url}${telegram_bot_id}/sendAnimation`;
                telegramRequest.body = { chat_id: chat_id, animation: sourceMedia };
            } else if (type == "dialog") { //SEND USER INPUT (TEXT QUESTION OR BUTTONS/KEYWORD OPTIONS)
                function setInlineKeyboard(items, ind) {
                    let button_option = { 'text': currentMessagesToSend[index].buttons[ind], 'callback_data': currentMessagesToSend[index].payloads[ind] };
                    return button_option;
                }
                const opts = {
                    "reply_markup": {
                        "inline_keyboard": [currentMessagesToSend[index].buttons.map(setInlineKeyboard)]
                    }
                }
                telegramRequest.url = `${telegram_url}${telegram_bot_id}/sendMessage`;
                telegramRequest.body = { chat_id: chat_id, text: currentMessagesToSend[index].button_message, reply_markup: opts.reply_markup };
            }

            try {
                axios.post(telegramRequest.url, telegramRequest.body)
                    .then(resp => {
                        console.log("Response:", resp.data)
                    })
                    .catch(error => {
                        console.log("Error:", error);
                    })
            } catch (err) {
                console.log(err)
            }

            // Continue loop to send all messages from Current Qeue if needed
            index++;
            if (index < delayArr) {
                delayLoop();
            }
        }, 750)
    }

    //3 - Trigger delayLoop to send messages to other platform to keep order of messages (if there are messages)

    if (currentMessagesToSend.length > 0) {
        delayLoop()
    }
}

/**
 * Capture requests from other platform, in this case Telegram, sample url: https://<your hook url>/telegram_hook
 */

app.post('/telegram_hook', function (req, res) {
    try {
        res.json({title: "sucess"})
        let chat_id;
        let messageTosend;
        let messageBody;

        //Capture and gather message request from other platform, in this case Telegram, and prepare for inmediate sending to Landbot API

        //If buttons answer in Telegram
        if ("callback_query" in req.body) {

            messageTosend = req.body.callback_query.data
            chat_id = req.body.callback_query.message.chat.id
            arrOptions = req.body.callback_query.message.reply_markup.inline_keyboard[0]

            let objAns = arrOptions.find(o => o.callback_data === req.body.callback_query.data);

            messageBody = {
                "message": {
                    "type": "text",
                    "message": objAns.text,
                    "payload": messageTosend
                }
            }
            //If Text message from user in Telegram
        } else {
            chat_id = req.body.message.chat.id
            messageTosend = req.body.message.text
            messageBody = {
                "message": {
                    "type": "text",
                    "message": messageTosend
                }
            }
        }

        const headers = { 'Authorization': `Token ${landbot_token}`, 'Content-Type': 'application/json' }
        const data = JSON.stringify(messageBody);

        //Request to Landbot API
        axios.post(`${landbot_url}/${chat_id}/`, data, { headers: headers })
            .then((resp) => {
                
            }).catch((error) => {
                console.log("ERROR:", error)
                
            });
    } catch (err) {
        console.log(err)
    }
})
