
export const N8N_WORKFLOW_TEMPLATE = {
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "autorent-agent",
        "responseMode": "responseNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [200, 300]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "value": "create_reservation", "field": "body.action" },
            { "value": "update_status", "field": "body.action" }
          ]
        }
      },
      "name": "Action Router",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 1,
      "position": [400, 300]
    },
    // --- BRANCH: NEW RESERVATION ---
    {
      "parameters": {
        "operation": "append",
        "sheetId": "={{ $json.body.sheetId }}",
        "range": "A:Z",
        "options": {}
      },
      "name": "Save to Google Sheets",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 3,
      "position": [700, 100],
      "notes": "Dynamic Sheet ID from Webhook"
    },
    {
      "parameters": {
        "sendTo": "={{$json.body.reservation.email}}",
        "subject": "Reserva Confirmada - AutoRent",
        "message": "Olá {{$json.body.reservation.driverName}},\n\nA sua reserva para o {{$json.body.reservation.selectedCar}} foi confirmada.\nLevantamento: {{$json.body.reservation.startDate}} @ {{$json.body.reservation.startTime}}\n\nObrigado,\nAutoRent Azores",
        "options": {}
      },
      "name": "Email Confirmation",
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2,
      "position": [900, 100]
    },
    {
        "parameters": {
            "from": "whatsapp:+14155238886", 
            "to": "whatsapp:{{$json.body.reservation.phone}}",
            "body": "🚗 Reserva Confirmada! O seu {{$json.body.reservation.selectedCar}} está reservado para {{$json.body.reservation.startDate}}."
        },
        "name": "WhatsApp Confirmation",
        "type": "n8n-nodes-base.twilio",
        "typeVersion": 1,
        "position": [900, 300]
    },
    // --- BRANCH: UPDATE STATUS ---
    {
        "parameters": {
          "rules": {
            "values": [
              { "value": "ready_for_pickup", "field": "body.status" },
              { "value": "completed", "field": "body.status" }
            ]
          }
        },
        "name": "Status Router",
        "type": "n8n-nodes-base.switch",
        "typeVersion": 1,
        "position": [700, 500]
    },
    // Ready for Pickup Logic
    {
      "parameters": {
        "sendTo": "={{$json.body.reservation.email}}",
        "subject": "Viatura Pronta - AutoRent",
        "message": "Olá,\n\nA sua viatura já está pronta para levantamento no parque P1.\nDirija-se ao nosso balcão.",
        "options": {}
      },
      "name": "Email Ready",
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2,
      "position": [1000, 500]
    },
    {
        "parameters": {
            "from": "whatsapp:+14155238886", 
            "to": "whatsapp:{{$json.body.reservation.phone}}",
            "body": "🔑 A sua viatura está pronta! Pode dirigir-se ao balcão para levantamento rápido."
        },
        "name": "WhatsApp Ready",
        "type": "n8n-nodes-base.twilio",
        "typeVersion": 1,
        "position": [1000, 700]
    },
    // Completed Logic (Feedback)
    {
      "parameters": {
        "sendTo": "={{$json.body.reservation.email}}",
        "subject": "Obrigado pela preferência - AutoRent",
        "message": "Obrigado por viajar connosco. Esperamos vê-lo em breve nos Açores!",
        "options": {}
      },
      "name": "Email Thank You",
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2,
      "position": [1000, 900]
    },
    // Final Response
    {
      "parameters": {
        "content": "{\"status\": \"success\", \"message\": \"Workflow processed\"}",
        "contentType": "json"
      },
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [1300, 500]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "Action Router", "type": "main", "index": 0 }]]
    },
    "Action Router": {
      "main": [
        [ // Output 0: Create Reservation
            { "node": "Save to Google Sheets", "type": "main", "index": 0 },
            { "node": "Email Confirmation", "type": "main", "index": 0 },
            { "node": "WhatsApp Confirmation", "type": "main", "index": 0 }
        ],
        [ // Output 1: Update Status
            { "node": "Status Router", "type": "main", "index": 0 }
        ]
      ]
    },
    "Status Router": {
        "main": [
            [ // Ready
                { "node": "Email Ready", "type": "main", "index": 0 },
                { "node": "WhatsApp Ready", "type": "main", "index": 0 }
            ],
            [ // Completed
                { "node": "Email Thank You", "type": "main", "index": 0 }
            ]
        ]
    },
    "Email Confirmation": { "main": [[{ "node": "Respond to Webhook", "type": "main", "index": 0 }]] },
    "Email Ready": { "main": [[{ "node": "Respond to Webhook", "type": "main", "index": 0 }]] },
    "Email Thank You": { "main": [[{ "node": "Respond to Webhook", "type": "main", "index": 0 }]] }
  }
};
