const serverless = require('serverless-http');
const app = require('../index');

module.exports.handler = serverless(app, {
    request(request, event, context) {
        request.event = event;
        request.context = context;

        // Netlify envía el body a veces serializado como Buffer o Base64
        if (event && event.body) {
            try {
                let rawBody = event.body;
                if (rawBody && typeof rawBody === 'object' && rawBody.type === 'Buffer' && Array.isArray(rawBody.data)) {
                    rawBody = Buffer.from(rawBody.data).toString('utf8');
                } else if (event.isBase64Encoded && typeof rawBody === 'string') {
                    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
                }

                if (typeof rawBody === 'string') {
                    request.body = JSON.parse(rawBody);
                } else if (typeof rawBody === 'object') {
                    request.body = rawBody;
                }
            } catch (err) {
                console.error('[NETLIFY API BODY PARSE ERROR]:', err);
            }
        }
    }
});
