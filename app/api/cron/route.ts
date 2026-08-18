import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { Resend } from "resend";

// Initialisation de Resend avec votre clé API
const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  // 1. Chercher tous les chantiers qui sont au statut "valide"
  const { data: chantiers, error } = await supabase
    .from("chantiers")
    .select("*")
    .eq("statut", "valide");

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  if (!chantiers || chantiers.length === 0) {
    return NextResponse.json({ message: "Aucun chantier en attente de commande. Pas de rappel." });
  }

  // 2. Envoyer un email pour chaque chantier trouvé
  for (const chantier of chantiers) {
    await resend.emails.send({
      from: "onboarding@resend.dev", // L'adresse d'envoi par défaut de Resend pour les tests
      to: process.env.EMAIL_ARTISAN!, // Votre adresse email
      subject: `🚨 URGENT : Commande à passer pour ${chantier.nom_client}`,
      html: `
        
          Rappel de commande !
          Le client ${chantier.nom_client} a validé sa liste de fournitures, mais tu n'as pas encore passé la commande.
          Ouvre ton tableau de bord pour passer la commande et arrêter ce rappel.
        
      `,
    });
  }

  return NextResponse.json({ message: `${chantiers.length} email(s) de rappel envoyé(s) avec succès !` });
}