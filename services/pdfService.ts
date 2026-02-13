
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

  const galleryImageStyle = "width: 180px; height: 130px; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 12px; margin: 5px;";

  const checkin = reservation.checkin;

  element.innerHTML = `
    <div style="border-bottom: 8px solid #2563eb; padding-bottom: 40px; margin-bottom: 50px;">
        <h1 style="color: #2563eb; margin: 0; font-size: 38px; font-weight: 900; font-style: italic;">AUTORENT AZORES ELITE</h1>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase;">Contrato de Aluguer e Termos Gerais</p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
      <div style="background: #f8fafc; padding: 30px; border-radius: 24px;">
        <h4 style="color: #2563eb; font-size: 11px; text-transform: uppercase; font-weight: 900;">LOCATÁRIO</h4>
        <p style="font-size: 15px; margin: 5px 0; font-weight: 900;">${reservation.mainDriver.name}</p>
        <p style="font-size: 12px;">LOCAL DE ESTADIA: ${reservation.pickupLocation || 'N/A'}</p>
      </div>
      <div style="background: #f8fafc; padding: 30px; border-radius: 24px;">
        <h4 style="color: #2563eb; font-size: 11px; text-transform: uppercase; font-weight: 900;">VIATURA</h4>
        <p style="font-size: 15px; margin: 5px 0; font-weight: 900;">${car.brand} ${car.model}</p>
        <p style="font-size: 12px;">MATRÍCULA: ${car.licensePlate}</p>
      </div>
    </div>

    <div style="margin-top: 40px;">
        <h3 style="font-size: 14px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; font-weight: 900;">TERMOS ACEITES</h3>
        <div style="font-size: 10px; color: #64748b; line-height: 1.6; margin-top: 15px;">
            <p>• Aceito o seguro com franquia de 800€ em caso de danos próprios.</p>
            <p>• Comprometo-me a entregar a viatura com o mesmo nível de combustível.</p>
            <p>• Aceito que o Agente IA realizou a vistoria digital via fotos anexadas abaixo.</p>
        </div>
    </div>

    <div style="margin-top: 40px;">
        <h3 style="font-size: 14px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; font-weight: 900;">VISTORIA DIGITAL</h3>
        
        <div style="margin-top: 20px;">
          <p style="font-size: 11px; font-weight: 900; margin-bottom: 10px;">ODÓMETRO</p>
          ${checkin?.odometerPhoto ? `<img src="${checkin.odometerPhoto}" style="${galleryImageStyle}"/>` : '<p style="font-size: 10px; color: #64748b;">Nenhuma foto capturada.</p>'}
        </div>

        <div style="margin-top: 20px;">
          <p style="font-size: 11px; font-weight: 900; margin-bottom: 10px;">INTERIORES (5 FOTOS)</p>
          <div style="display: flex; flex-wrap: wrap; gap: 5px;">
            ${(checkin?.interiorPhotos || []).map(img => `<img src="${img}" style="${galleryImageStyle}"/>`).join('')}
          </div>
        </div>

        <div style="margin-top: 20px;">
          <p style="font-size: 11px; font-weight: 900; margin-bottom: 10px;">EXTERIORES (4 FOTOS)</p>
          <div style="display: flex; flex-wrap: wrap; gap: 5px;">
            ${(checkin?.exteriorPhotos || []).map(img => `<img src="${img}" style="${galleryImageStyle}"/>`).join('')}
          </div>
        </div>

        <div style="margin-top: 20px;">
          <p style="font-size: 11px; font-weight: 900; margin-bottom: 10px;">DANOS EXISTENTES (ATÉ 5 FOTOS)</p>
          <div style="display: flex; flex-wrap: wrap; gap: 5px;">
            ${(checkin?.damagePhotos || []).length > 0 
              ? (checkin?.damagePhotos || []).map(img => `<img src="${img}" style="${galleryImageStyle}"/>`).join('')
              : '<p style="font-size: 10px; color: #64748b;">Nenhum dano reportado.</p>'
            }
          </div>
        </div>
    </div>

    <div style="margin-top: 120px; text-align: right; border-top: 3px solid #2563eb; padding-top: 25px;">
        <p style="font-size: 11px; font-weight: 900; color: #2563eb;">ASSINATURA DIGITAL DO CLIENTE</p>
        <img src="${signatureBase64}" style="height: 100px; margin: 10px 0;" />
        <p style="font-size: 14px; font-weight: 900;">${reservation.mainDriver.name.toUpperCase()}</p>
        <p style="font-size: 10px; color: #64748b;">Confirmado digitalmente em ${new Date().toLocaleString()}</p>
    </div>
  `;

  const options = {
    margin: 10,
    filename: `CONTRATO_${car.licensePlate}_${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // @ts-ignore
  await window.html2pdf().from(element).set(options).save();
};
