import { LightningElement, track } from 'lwc';
import startSessionApex from '@salesforce/apex/EinsteinChatBotController.startSession';
import getAccessToken from '@salesforce/apex/EinsteinChatBotController.getAccessToken';

export default class ChatBotScreen extends LightningElement {
    @track messages = [];
    @track userInput = '';
    sessionId;
    accessToken;
    sessionStarted = false;
    @track isWaiting = false;

    async startSession() {
        try {
            // Step 1: Get Access Token
            const token = await getAccessToken();
            this.accessToken = token;
            console.log('Access Token:', this.accessToken);
            // Step 2: Start Session
            const sessionRes = await startSessionApex({ accessToken: this.accessToken });
            this.sessionId = sessionRes.sessionId;
            this.sessionStarted = true;

            // Step 3: Push initial bot message
            const welcome = sessionRes.messages[0];
            this.messages = [{
                id: welcome.id,
                sender: 'Agent',
                text: welcome.message,
                cssClass: 'msg bot'
            }];
        } catch (err) {
            console.error('Start session failed:', err);
        }
    }

    async sendMessage() {
        if (!this.userInput || !this.sessionStarted) return;
        const timestamp = Date.now();
        // Push user message
        const userMsg = {
            id: Date.now(),
            sender: 'You',
            text: this.userInput,
            cssClass: 'msg user'
        };
        this.messages.push(userMsg);
        this.isWaiting = true;
        const body = {
            message: {
                sequenceId: Date.now(),
                type: 'Text',
                text: this.userInput
            },
            variables: []
        };
        const streamUrl = `https://api.salesforce.com/einstein/ai-agent/v1/sessions/${this.sessionId}/messages/stream`;
        try {
            const response = await fetch(
                `https://api.salesforce.com/einstein/ai-agent/v1/sessions/${this.sessionId}/messages/stream`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
            );
            if (!response.ok || !response.body) {
                throw new Error('Streaming response failed or no response body.');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let messageChunks = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');

                for (let i = 0; i < events.length - 1; i++) {
                    const eventBlock = events[i].trim();
                    const dataLine = eventBlock.split('\n').find(line => line.startsWith('data:'));

                    if (dataLine) {
                        const jsonText = dataLine.replace(/^data:\s*/, '');
                        try {
                            const parsed = JSON.parse(jsonText);
                            const msgType = parsed.message?.type;

                            if (msgType === 'TextChunk') {
                                messageChunks += parsed.message?.message || '';
                            }

                            if ((msgType === 'Inform' || msgType === 'EndOfTurn') && messageChunks.trim()) {
                                const finalMessage = parsed.message?.message || messageChunks;

                                // ✅ Only push if message is non-empty and not already displayed
                                if (finalMessage.trim()) {
                                    this.messages.push({
                                        id: parsed.message?.id || Date.now(),
                                        sender: 'Agent',
                                        text: finalMessage.trim(), // trim to remove trailing spaces
                                        cssClass: 'msg bot'
                                    });
                                }

                                messageChunks = ''; // Reset after message is used
                                this.isWaiting = false;
                            }

                        } catch (e) {
                            console.warn('Failed to parse streaming line:', jsonText, e);
                        }
                    }
                }

                // Preserve leftover buffer if partial event remains
                buffer = events[events.length - 1];
            }


        } catch (err) {
            console.error('Error sending message:', err);
        }

        this.userInput = '';
    }

    async endSession() {
        if (!this.sessionId || !this.accessToken) return;

        try {
            await fetch(`https://api.salesforce.com/einstein/ai-agent/v1/sessions/${this.sessionId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            this.messages.push({
                id: Date.now(),
                sender: 'Agent',
                text: 'Session ended.',
                cssClass: 'msg bot'
            });

            this.sessionStarted = false;
            this.sessionId = null;

        } catch (err) {
            console.error('End session failed:', err);
        }
    }

    handleInput(event) {
        this.userInput = event.target.value;
    }

    handleKeyUp(event) {
        if (event.key === 'Enter') {
            this.sendMessage();
        }
    }
}
