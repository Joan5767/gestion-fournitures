import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { nomClient, nomChantier } = await request.json();

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.EMAIL_ARTISAN!,
      subject: `🚨 VALIDATION : Chantier ${nomChantier || "de " + nomClient}`,
      html: `
        <div>
          <h2>Validation des fournitures reçue !</h2>
          <p>Le client <strong>${nomClient}</strong> vient de valider sa liste pour le chantier : <strong>${nomChantier || nomClient}</strong>.</p>
          <p>Connectez-vous à votre tableau de bord pour consulter les choix validés/refusés et passer les commandes.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }
}