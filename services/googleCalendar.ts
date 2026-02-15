
import { GoogleCalendar, ReservationData } from "../types";

// Types for the Google API Client
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

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
            
            const script2 = document.createElement('script');
            script2.src = 'https://accounts.google.com/gsi/client';
            script2.async = true;
            script2.defer = true;
            script2.onload = () => {
              this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: (resp: any) => {
                  if (resp.error !== undefined) throw (resp);
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
        reject("Google API not initialized.");
        return;
      }
      this.tokenClient.callback = (resp: any) => {
        if (resp.error) reject(resp);
        else {
          this.accessToken = resp.access_token;
          resolve(resp.access_token);
        }
      };
      this.tokenClient.requestAccessToken({prompt: 'consent'});
    });
  }

  public get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  // --- NEW: SPREADSHEET CREATION ---
  public async createSpreadsheet(title: string): Promise<string> {
    if (!this.isAuthenticated) await this.signIn();
    const response = await window.gapi.client.sheets.spreadsheets.create({
      resource: { properties: { title: title } }
    });
    return response.result.spreadsheetId;
  }

  // --- CALENDAR ---
  public async createCalendar(summary: string): Promise<GoogleCalendar> {
    if (!this.isAuthenticated) await this.signIn();
    const response = await window.gapi.client.calendar.calendars.insert({
      resource: { summary: summary, description: "Criado via AutoRent AI Elite." }
    });
    return { id: response.result.id, summary: response.result.summary, description: response.result.description };
  }

  public async listCalendars(): Promise<GoogleCalendar[]> {
    if (!this.isAuthenticated) throw new Error("User not signed in");
    const response = await window.gapi.client.calendar.calendarList.list();
    const items = response.result.items || [];
    return items.map((item: any) => ({
      id: item.id,
      summary: item.summary,
      primary: item.primary,
      description: item.description
    }));
  }

  public async appendToSheet(spreadsheetId: string, reservation: ReservationData): Promise<void> {
    const values = [
        reservation.id || Date.now().toString(),
        reservation.createdAt || new Date().toISOString(),
        reservation.mainDriver.name,
        reservation.mainDriver.email,
        reservation.mainDriver.phone,
        reservation.selectedCarId || 'N/A',
        'N/A',
        reservation.startDate || '',
        reservation.startTime || '10:00',
        reservation.endDate || '',
        reservation.endTime || '10:00',
        reservation.status || 'Confirmed',
        reservation.selectedInsuranceId || 'N/A',
        '0',
        '100%'
    ];
    await this.appendRow(spreadsheetId, values as string[]);
  }

  public async appendRow(spreadsheetId: string, rowData: string[]): Promise<void> {
      if (!this.isAuthenticated) throw new Error("User not signed in");
      const body = { values: [rowData] };
      await window.gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheetId,
          range: 'Sheet1!A:A',
          valueInputOption: 'USER_ENTERED',
          resource: body,
      });
  }

  public async sendEmail(to: string, subject: string, messageBody: string): Promise<void> {
      if (!this.isAuthenticated) throw new Error("User not signed in");
      const email = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', 'MIME-Version: 1.0', '', messageBody].join('\r\n');
      const base64EncodedEmail = window.btoa(unescape(encodeURIComponent(email))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await window.gapi.client.gmail.users.messages.send({ 'userId': 'me', 'resource': { 'raw': base64EncodedEmail } });
  }
}

export const googlePlatformService = new GooglePlatformService();
