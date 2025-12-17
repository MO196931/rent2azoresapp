
import { GoogleCalendar, ReservationData } from "../types";

// Types for the Google API Client
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Scopes for Calendar, Sheets, and Gmail (Send)
const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.send';
const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
    'https://sheets.googleapis.com/$discovery/rest?version=v4',
    'https://gmail.googleapis.com/$discovery/rest?version=v1'
];

class GooglePlatformService {
  private tokenClient: any;
  private isInitialized = false;
  private accessToken: string | null = null;

  // Load the GAPI scripts dynamically
  public async loadScripts(clientId: string, apiKey: string): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const script1 = document.createElement('script');
      script1.src = 'https://apis.google.com/js/api.js';
      script1.async = true;
      script1.defer = true;
      script1.onload = () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({
              apiKey: apiKey,
              discoveryDocs: DISCOVERY_DOCS,
            });
            
            // Load GIS client
            const script2 = document.createElement('script');
            script2.src = 'https://accounts.google.com/gsi/client';
            script2.async = true;
            script2.defer = true;
            script2.onload = () => {
              this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: (resp: any) => {
                  if (resp.error !== undefined) {
                    throw (resp);
                  }
                  this.accessToken = resp.access_token;
                },
              });
              this.isInitialized = true;
              resolve();
            };
            script2.onerror = reject;
            document.body.appendChild(script2);

          } catch (err) {
            reject(err);
          }
        });
      };
      script1.onerror = reject;
      document.body.appendChild(script1);
    });
  }

  public signIn(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        reject("Google API not initialized. Check System Settings.");
        return;
      }
      
      this.tokenClient.callback = (resp: any) => {
        if (resp.error) {
          reject(resp);
        } else {
          this.accessToken = resp.access_token;
          resolve(resp.access_token);
        }
      };

      if (window.gapi.client.getToken() === null) {
        this.tokenClient.requestAccessToken({prompt: 'consent'});
      } else {
        this.tokenClient.requestAccessToken({prompt: ''});
      }
    });
  }

  public get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  // --- CALENDAR ---

  public async listCalendars(): Promise<GoogleCalendar[]> {
    if (!this.isAuthenticated) throw new Error("User not signed in");
    const response = await window.gapi.client.calendar.calendarList.list();
    return response.result.items.map((item: any) => ({
      id: item.id,
      summary: item.summary,
      primary: item.primary,
      description: item.description
    }));
  }

  public async createCalendar(summary: string): Promise<GoogleCalendar> {
    if (!this.isAuthenticated) throw new Error("User not signed in");
    const response = await window.gapi.client.calendar.calendars.insert({
      resource: { summary: summary, description: "Criado via AutoRent AI." }
    });
    return { id: response.result.id, summary: response.result.summary, description: response.result.description };
  }

  public async isAvailable(calendarId: string, startIso: string, endIso: string): Promise<boolean> {
    if (!this.isAuthenticated) return true;
    try {
      const response = await window.gapi.client.calendar.events.list({
        calendarId: calendarId,
        timeMin: new Date(startIso).toISOString(),
        timeMax: new Date(endIso).toISOString(),
        singleEvents: true
      });
      return response.result.items.length === 0;
    } catch (error) {
      console.error("Availability check failed", error);
      return false;
    }
  }

  public async createEvent(calendarId: string, eventDetails: { summary: string, description: string, start: string, end: string, email?: string }): Promise<string> {
    if (!this.isAuthenticated) throw new Error("User not signed in");
    
    const resource: any = {
      'summary': eventDetails.summary,
      'description': eventDetails.description,
      'attendees': eventDetails.email ? [{'email': eventDetails.email}] : [],
    };

    // Check if input is a Date string (YYYY-MM-DD) or DateTime string (has 'T')
    if (eventDetails.start.includes('T')) {
        resource.start = { 'dateTime': eventDetails.start, 'timeZone': 'Atlantic/Azores' };
        resource.end = { 'dateTime': eventDetails.end, 'timeZone': 'Atlantic/Azores' };
    } else {
        resource.start = { 'date': eventDetails.start };
        resource.end = { 'date': eventDetails.end };
    }

    const response = await window.gapi.client.calendar.events.insert({ calendarId: calendarId, resource: resource });
    return response.result.id;
  }

  // --- GOOGLE SHEETS ---

  // For Reservations (Specific structure)
  public async appendToSheet(spreadsheetId: string, reservation: ReservationData): Promise<void> {
      const values = [
          reservation.id || Date.now().toString(),
          new Date().toISOString(), // Created At
          reservation.driverName,
          reservation.email,
          reservation.phone,
          reservation.selectedCar,
          reservation.licensePlate,
          reservation.startDate,
          reservation.startTime || '10:00', // Added Time
          reservation.endDate,
          reservation.endTime || '10:00', // Added Time
          reservation.status || 'Confirmed',
          reservation.selectedInsurance,
          (reservation.odometer || 0).toString(),
          (reservation.fuelLevel || 'N/A')
      ];
      await this.appendRow(spreadsheetId, values as string[]);
  }

  // For Generic AI Logs (Flexible structure)
  public async appendRow(spreadsheetId: string, rowData: string[]): Promise<void> {
      if (!this.isAuthenticated) throw new Error("User not signed in");
      
      const body = { values: [rowData] };

      try {
          await window.gapi.client.sheets.spreadsheets.values.append({
              spreadsheetId: spreadsheetId,
              range: 'A:A', // Appends to the first sheet automatically
              valueInputOption: 'USER_ENTERED',
              resource: body,
          });
      } catch (e) {
          console.error("Sheet Append Error", e);
          throw e;
      }
  }

  // --- GMAIL ---

  public async sendEmail(to: string, subject: string, messageBody: string): Promise<void> {
      if (!this.isAuthenticated) throw new Error("User not signed in");

      // Construct MIME message
      const emailLines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        '',
        messageBody
      ];

      const email = emailLines.join('\r\n');
      
      // Base64URL encode
      const base64EncodedEmail = window.btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      try {
        await window.gapi.client.gmail.users.messages.send({
          'userId': 'me',
          'resource': {
            'raw': base64EncodedEmail
          }
        });
      } catch (e) {
          console.error("Gmail Send Error", e);
          throw e;
      }
  }
}

export const googlePlatformService = new GooglePlatformService();
