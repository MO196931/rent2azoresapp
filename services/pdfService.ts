
import { ReservationData, CompanySettings, CarDetails } from '../types';

export const generateRentalContract = async (
  reservation: ReservationData,
  company: CompanySettings,
  car: CarDetails,
  signatureBase64: string
) => {
  const element = document.createElement('div');
  element.style.padding = '40px';
  element.style.color = '#1e293b';
  element.style.fontFamily = 'Helvetica, Arial, sans-serif';
  element.style.backgroundColor = '#ffffff';
  element.style.width = '800px'; // Fixed width for consistent PDF rendering

  const totalPrice = car.price;

  element.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #2563eb; padding-bottom: 25px; margin-bottom: 40px;">
      <div>
        <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">AUTORENT AZORES ELITE</h1>
        <p style="margin: 5px 0; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 2px;">Premium Mobility Solutions</p>
      </div>
      <div style="text-align: right; font-size: 10px; line-height: 1.6; color: #475569;">
        <strong style="color: #1e293b; font-size: 12px;">${company.name}</strong><br>
        NIF: ${company.nif} | Licença IMT: 12345/2024<br>
        ${company.address}<br>
        T: +351 296 000 000 | E: ${company.email}
      </div>
    </div>

    <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0;">
        <h2 style="text-align: center; text-transform: uppercase; font-size: 14px; margin: 0; color: #1e293b; letter-spacing: 1px;">Contrato de Aluguer Sem Condutor n.º ${reservation.id || 'TEST-999'}</h2>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
      <div style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">
        <h3 style="font-size: 11px; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 0; text-transform: uppercase;">1. Locatário (Cliente)</h3>
        <p style="font-size: 11px; margin: 8px 0;"><strong>Nome:</strong> ${reservation.driverName || 'N/A'}</p>
        <p style="font-size: 11px; margin: 8px 0;"><strong>Email:</strong> ${reservation.email || 'N/A'}</p>
        <p style="font-size: 11px; margin: 8px 0;"><strong>NIF:</strong> ${reservation.nif || 'N/A'}</p>
        <p style="font-size: 11px; margin: 8px 0;"><strong>Telefone:</strong> ${reservation.phone || 'N/A'}</p>
      </div>
      <div style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">
        <h3 style="font-size: 11px; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 0; text-transform: uppercase;">2. Viatura e Período</h3>
        <p style="font-size: 11px; margin: 8px 0;"><strong>Viatura:</strong> ${car.brand} ${car.model} (${car.licensePlate})</p>
        <p style="font-size: 11px; margin: 8px 0;"><strong>Início:</strong> ${reservation.startDate} ${reservation.startTime}</p>
        <p style="font-size: 11px; margin: 8px 0;"><strong>Fim:</strong> ${reservation.endDate} ${reservation.endTime}</p>
        <p style="font-size: 11px; margin: 8px 0;"><strong>Seguro:</strong> ${reservation.selectedInsurance === 's2' ? 'VIP (Isenção Total)' : 'Básico (Franquia 800€)'}</p>
      </div>
    </div>

    <div style="margin-bottom: 40px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #e2e8f0;">
        <thead>
          <tr style="background: #2563eb; color: #ffffff;">
            <th style="padding: 12px; text-align: left; border: 1px solid #2563eb;">Item / Serviço</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #2563eb;">Qtd</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #2563eb;">Total (C/ IVA)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 12px; border: 1px solid #e2e8f0;">Aluguer de Viatura - Categoria ${car.category}</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">1</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${totalPrice}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="font-size: 9px; color: #64748b; margin-bottom: 50px; line-height: 1.8; text-align: justify; border-left: 3px solid #cbd5e1; padding-left: 15px;">
      <strong>NOTAS LEGAIS:</strong> O Locatário declara que os dados fornecidos são verdadeiros. Recebe a viatura com o depósito de combustível conforme assinalado e obriga-se a devolvê-la no mesmo estado. Em caso de acidente, o Locatário deverá contactar a Assistência em Viagem e preencher a Declaração Amigável.
    </div>

    <div style="display: flex; justify-content: flex-end; align-items: center; gap: 40px;">
      <div style="text-align: center;">
        <p style="font-size: 10px; color: #64748b; margin-bottom: 15px; text-transform: uppercase; font-weight: bold;">O Agente AutoRent</p>
        <div style="width: 150px; height: 1px; background: #000; margin: 0 auto 5px;"></div>
        <p style="font-size: 8px; color: #94a3b8;">Selo Digital AI-Verified</p>
      </div>
      <div style="text-align: center;">
        <p style="font-size: 11px; margin-bottom: 10px; font-weight: bold; text-transform: uppercase;">O Locatário</p>
        <img src="${signatureBase64}" style="width: 220px; border-bottom: 2px solid #1e293b; padding-bottom: 5px; display: block; margin: 0 auto;" />
        <p style="font-size: 11px; margin-top: 8px; font-weight: 900; color: #1e293b;">${reservation.driverName || '---'}</p>
        <p style="font-size: 8px; color: #94a3b8;">Timestamp: ${new Date().toISOString()}</p>
      </div>
    </div>

    <div style="margin-top: 60px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px;">
        <p style="font-size: 8px; color: #cbd5e1;">Este documento foi gerado eletronicamente e assinado digitalmente nos termos da lei vigente.</p>
    </div>
  `;

  const options = {
    margin: [10, 10, 10, 10],
    filename: `Contrato_AutoRent_${reservation.id || 'TEST'}.pdf`,
    image: { type: 'jpeg', quality: 1.0 },
    html2canvas: { scale: 3, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }
  };

  // @ts-ignore
  const pdfInstance = window.html2pdf().from(element).set(options);
  await pdfInstance.save();
  return true;
};

// Função para gerar um PDF de teste instantâneo
export const runPdfTest = async () => {
  const mockRes: ReservationData = {
    id: 'TEST-SESSION-01',
    driverName: 'Test User Elite',
    email: 'test@autorent.pt',
    nif: '123456789',
    phone: '+351 900 000 000',
    startDate: '2024-07-20',
    startTime: '10:00',
    endDate: '2024-07-25',
    endTime: '18:00',
    selectedInsurance: 's2',
    transcript: [],
    additionalDrivers: [],
    selectedExtras: [],
    documentsUploaded: true
  };
  
  const mockCompany: CompanySettings = {
    name: 'AutoRent Azores Elite S.A.',
    address: 'Avenida do Mar, 9500-000 Ponta Delgada',
    nif: '500123456',
    email: 'ops@autorent.pt',
    iban: 'PT50 0000 0000 0000 0000 0000 0'
  };

  const mockCar: CarDetails = {
    id: 'c2',
    brand: 'Jeep',
    model: 'Renegade 4xe',
    licensePlate: 'AZ-ELITE-01',
    category: 'SUV Premium',
    price: '125€/dia',
    specs: 'Híbrido, Auto, 4x4',
    image: '',
    maintenanceHistory: []
  };

  // Fake signature for test
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (ctx) {
      ctx.font = '30px cursive';
      ctx.fillText('Test Signature', 10, 50);
  }
  
  return await generateRentalContract(mockRes, mockCompany, mockCar, canvas.toDataURL());
};
