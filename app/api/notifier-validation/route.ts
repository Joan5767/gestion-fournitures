import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { nomClient } = await request.json();

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.EMAIL_ARTISAN!,
      subject: `🚨 VALIDATION : Le client ${nomClient} a validé ses fournitures !`,
      html: `
        <div>
          <h2>Validation reçue !</h2>
          <p>Le client <strong>${nomClient}</strong> vient de valider sa liste de fournitures.</p>
          <p>Connectez-vous à votre tableau de bord pour consulter les choix et passer les commandes.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }
}