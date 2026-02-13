
import { ReservationData, CompanySettings, CarDetails } from '../types';

export const generateRentalContract = async (
  reservation: ReservationData,
  company: CompanySettings,
  car: CarDetails,
  signatureBase64: string
) => {
  const element = document.createElement('div');
  element.style.padding = '60px';
  element.style.backgroundColor = '#ffffff';
  element.style.width = '1000px';
  element.style.fontFamily = "'Inter', sans-serif";
  element.style.color = '#0f172a';

  const docImageStyle = "width: 250px; height: 160px; object-fit: cover; border: 2px solid #f1f5f9; border-radius: 12px; margin-top: 10px;";
  const galleryImageStyle = "width: 220px; height: 160px; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 12px; margin: 5px;";

  const renderSection = (title: string, content: string) => `
    <div style="margin-top: 40px; page-break-inside: avoid;">
      <h3 style="font-size: 14px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900;">${title}</h3>
      <div style="font-size: 11px; line-height: 1.6; color: #334155;">${content}</div>
    </div>
  `;

  const checkin = reservation.checkin;

  element.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 8px solid #2563eb; padding-bottom: 40px; margin-bottom: 50px;">
      <div>
        <h1 style="color: #2563eb; margin: 0; font-size: 38px; font-weight: 900; letter-spacing: -0.05em; font-style: italic;">ELITE AZORES</h1>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">Contrato Digital de Aluguer de Viaturas VIP</p>
      </div>
      <div style="text-align: right; font-size: 11px; color: #94a3b8; font-weight: 600;">
        <p style="font-weight: 900; color: #0f172a;">AUTORENT AZORES, LDA</p>
        <p>${company.address}</p>
        <p>NIF: ${company.nif} | ${company.email}</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
      <div style="background: #f8fafc; padding: 30px; border-radius: 24px; border: 1px solid #f1f5f9;">
        <h4 style="margin: 0 0 15px 0; color: #2563eb; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900;">LOCATÁRIO</h4>
        <p style="font-size: 15px; margin: 5px 0; font-weight: 900;">${reservation.mainDriver.name}</p>
        <p style="font-size: 12px; margin: 5px 0;">ID/CC: ${reservation.mainDriver.idNumber || 'Verificado via OCR'}</p>
        <p style="font-size: 12px; margin: 5px 0;">EMAIL: ${reservation.mainDriver.email}</p>
      </div>
      <div style="background: #f8fafc; padding: 30px; border-radius: 24px; border: 1px solid #f1f5f9;">
        <h4 style="margin: 0 0 15px 0; color: #2563eb; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900;">VIATURA</h4>
        <p style="font-size: 15px; margin: 5px 0; font-weight: 900;">${car.brand} ${car.model}</p>
        <p style="font-size: 12px; margin: 5px 0;">MATRÍCULA: ${car.licensePlate}</p>
        <p style="font-size: 12px; margin: 5px 0;">KM ATUAIS: ${checkin?.odometerValue || 'Ver imagem'} KM</p>
      </div>
    </div>

    ${renderSection('Relatório de Vistoria (Check-in Digital)', `
      <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        ${checkin?.odometerPhoto ? `<div><p style="font-size: 9px; font-weight: 900; color: #2563eb; margin-bottom: 5px;">PAINEL (KM/FUEL)</p><img src="${checkin.odometerPhoto}" style="${galleryImageStyle}"/></div>` : ''}
        ${checkin?.interiorFront ? `<div><p style="font-size: 9px; font-weight: 900; color: #2563eb; margin-bottom: 5px;">INT. FRENTE</p><img src="${checkin.interiorFront}" style="${galleryImageStyle}"/></div>` : ''}
        ${checkin?.exteriorFront ? `<div><p style="font-size: 9px; font-weight: 900; color: #2563eb; margin-bottom: 5px;">EXT. FRENTE</p><img src="${checkin.exteriorFront}" style="${galleryImageStyle}"/></div>` : ''}
        ${checkin?.exteriorBack ? `<div><p style="font-size: 9px; font-weight: 900; color: #2563eb; margin-bottom: 5px;">EXT. TRÁS</p><img src="${checkin.exteriorBack}" style="${galleryImageStyle}"/></div>` : ''}
      </div>
      <div style="margin-top: 25px; padding: 25px; background: #eff6ff; border-radius: 20px; font-size: 12px;">
        <p><strong>Nível de Combustível/Energia:</strong> ${checkin?.fuelLevel || '100%'}</p>
        <p><strong>Observações Declaradas pelo Cliente:</strong> ${checkin?.observations || 'Declaro que a viatura não apresenta danos visíveis para além dos registados fotográficamente.'}</p>
      </div>
    `)}

    <div style="page-break-before: always; margin-top: 50px;">
        <h3 style="font-size: 14px; border-bottom: 2px solid #2563eb; color: #2563eb; padding-bottom: 12px; font-weight: 900;">DOCUMENTAÇÃO DO CONDUTOR</h3>
        <div style="display: flex; gap: 30px; margin-top: 25px;">
            <div style="text-align: center;">
              <p style="font-size: 10px; font-weight: 900; margin-bottom: 8px; color: #64748b;">DOC. IDENTIFICAÇÃO</p>
              <img src="${reservation.mainDriver.docFront}" style="${docImageStyle}"/>
            </div>
            <div style="text-align: center;">
              <p style="font-size: 10px; font-weight: 900; margin-bottom: 8px; color: #64748b;">CARTA DE CONDUÇÃO</p>
              <img src="${reservation.mainDriver.licenseFront}" style="${docImageStyle}"/>
            </div>
        </div>
    </div>

    <div style="margin-top: 120px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div style="text-align: center; width: 45%; border-top: 2px solid #e2e8f0; padding-top: 25px;">
        <p style="font-size: 11px; font-weight: 900; color: #94a3b8; margin-bottom: 30px;">PELA ELITE AZORES / AUTORENT</p>
        <div style="height: 60px;"></div>
      </div>
      <div style="text-align: center; width: 45%; border-top: 3px solid #2563eb; padding-top: 25px;">
        <p style="font-size: 11px; font-weight: 900; color: #2563eb; margin-bottom: 10px;">O LOCATÁRIO (Assinatura Digital)</p>
        <img src="${signatureBase64}" style="height: 100px; margin-bottom: 15px;" />
        <p style="font-size: 14px; font-weight: 900; margin: 0;">${reservation.mainDriver.name.toUpperCase()}</p>
        <p style="font-size: 10px; color: #64748b; margin-top: 8px;">Concordância Digital em ${new Date().toLocaleString()}</p>
      </div>
    </div>
  `;

  const options = {
    margin: 10,
    filename: `CONTRATO_ELITE_${car.licensePlate}_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 1.0 },
    html2canvas: { scale: 3, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // @ts-ignore
  const pdf = window.html2pdf().from(element).set(options);
  await pdf.save();
};

// Added missing runPdfTest function to fix build error in DiagnosticDashboard.
export const runPdfTest = async () => {
  // @ts-ignore
  if (!window.html2pdf) {
    throw new Error("HTML2PDF library not found");
  }
  return true;
};
