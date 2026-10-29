"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";

export default function PageValidationClient() {
  const params = useParams();
  const token = params.token as string;

  const [chantier, setChantier] = useState<any>(null);
  const [fournitures, setFournitures] = useState<any[]>([]);
  const [articlesRefuses, setArticlesRefuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [validationEnCours, setValidationEnCours] = useState(false);
  
  const [reponses, setReponses] = useState<{ [key: string]: string }>({});
  // MODIFICATION : État pour le NOUVEAU commentaire uniquement
  const [nouveauCommentaire, setNouveauCommentaire] = useState("");

  useEffect(() => {
    async function fetchDonnees() {
      const { data: chantierData } = await supabase.from("chantiers").select("*").eq("token_validation", token).single();
      if (chantierData) {
        setChantier(chantierData);

        const { data: fournituresData } = await supabase.from("fournitures").select("*").eq("chantier_id", chantierData.id).order("created_at", { ascending: true });
        if (fournituresData) {
          setFournitures(fournituresData);
          setArticlesRefuses(fournituresData.filter(f => f.refuse).map(f => f.id));
          
          const reponsesInitiales: { [key: string]: string } = {};
          fournituresData.forEach(f => {
            if (f.reponse_client) reponsesInitiales[f.id] = f.reponse_client;
          });
          setReponses(reponsesInitiales);
        }
      }
      setLoading(false);
    }
    fetchDonnees();
  }, [token]);

  const basculerRefus = (id: string, estValide: boolean, estCommande: boolean) => {
    if (estValide || chantier.statut === "valide" || chantier.statut === "commande_passee" || estCommande) return;
    setArticlesRefuses((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
  };

  const handleReponseChange = (id: string, texte: string) => {
    setReponses(prev => ({ ...prev, [id]: texte }));
  };

  const validerFournitures = async () => {
    if (chantier.statut === "valide" || chantier.statut === "commande_passee" ||
        !fournitures.some((item) => !item.est_valide && !item.commande_sans_validation_client && !item.commande_passee)) {
      alert("Aucun article en attente de validation.");
      return;
    }
    setValidationEnCours(true);
    
    try {
      // Un numéro identique pour tous les articles approuvés lors de cette
      // validation ; le prochain numéro est l'étape suivante du certificat.
      // date_validation est aussi comptée pour les anciens chantiers dont
      // l'historique n'aurait pas encore été initialisé.
      const datesDejaValidees = [
        ...(Array.isArray(chantier.historique_validations) ? chantier.historique_validations : []),
        chantier.date_validation
      ].filter((valeur: unknown): valeur is string =>
        typeof valeur === "string" && !!valeur.trim() && !Number.isNaN(new Date(valeur).getTime())
      );
      const nombreEtapesExistantes = new Set(datesDejaValidees.map((date) => new Date(date).getTime())).size;
      const numeroValidationCourante = nombreEtapesExistantes + 1;

      for (const item of fournitures) {
        // Une commande exceptionnelle n'est jamais validée automatiquement par le client.
        // Cet article reste explicitement « non validé par le client ».
        if (!item.est_valide && !item.commande_sans_validation_client && !item.commande_passee) {
          const estRefuse = articlesRefuses.includes(item.id);
          const reponseClient = reponses[item.id] || null;
          
          const { error: errFourniture } = await supabase.from("fournitures").update({ 
            refuse: estRefuse,
            est_valide: true,
            // Le numéro désigne une approbation de l'article, pas un refus.
            numero_validation_client: estRefuse ? null : numeroValidationCourante,
            reponse_client: reponseClient 
          }).eq("id", item.id);

          if (errFourniture) {
            alert(`Erreur technique sur l'article "${item.designation}" : ${errFourniture.message}`);
            setValidationEnCours(false);
            return;
          }
        }
      }
      
      // MODIFICATION : Construction de l'historique des commentaires
      let commentaireFinal = chantier.commentaire_client || "";
      if (nouveauCommentaire.trim()) {
        const dateAjout = new Date().toLocaleString("fr-FR", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const separateur = commentaireFinal ? "\n\n" : "";
        commentaireFinal = `${commentaireFinal}${separateur}--- Ajouté le ${dateAjout} ---\n${nouveauCommentaire.trim()}`;
      }
      
      const currentDate = new Date().toISOString();
      const historiqueActuel = chantier.historique_validations || [];
      const nouvelHistorique = [...historiqueActuel, currentDate];

      const { error: errChantier } = await supabase.from("chantiers").update({ 
        statut: "valide", 
        date_validation: currentDate,
        historique_validations: nouvelHistorique,
        commentaire_client: commentaireFinal // On enregistre le texte cumulé
      }).eq("id", chantier.id);
      
      if (errChantier) {
        alert(`Erreur lors de la validation globale : ${errChantier.message}`);
        setValidationEnCours(false);
        return;
      }

      await fetch("/api/notifier-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          nomClient: chantier.nom_client,
          nomChantier: chantier.nom_chantier || chantier.nom_client 
        }),
      });

      alert("Vos choix et vos réponses ont été enregistrés avec succès !");
      window.location.reload();
      
    } catch (e: any) {
      alert(`Une erreur inattendue est survenue : ${e.message}`);
      setValidationEnCours(false);
    }
  };

  if (loading) return <div className="p-10 text-center">Chargement...</div>;
  if (!chantier) return <div className="p-10 text-center text-red-500">Lien invalide.</div>;

  const toutEstValide = chantier.statut === "valide" || chantier.statut === "commande_passee";
  const aDesCommandesExceptionnelles = fournitures.some((f) => f.commande_sans_validation_client);
  const articlesRestantAValider = fournitures.filter((f) =>
    !f.est_valide && !f.commande_sans_validation_client && !f.commande_passee
  );
  const validationPossible = !toutEstValide && articlesRestantAValider.length > 0;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 mt-10 bg-white shadow-lg rounded-lg border">
      <h1 className="text-2xl font-bold mb-2">Validation des fournitures</h1>
      <p className="text-gray-600 mb-6">Chantier : {chantier.nom_client}</p>

      <div className="bg-gray-50 p-4 rounded-md mb-6 border">
        <h2 className="font-semibold mb-2 border-b pb-2">Matériel prévu :</h2>
        {validationPossible && <p className="text-sm text-blue-600 mb-4 font-medium">Veuillez vérifier les articles non encore validés ci-dessous. Si vous ne souhaitez pas un article, cliquez sur « Refuser ».</p>}
        {aDesCommandesExceptionnelles && (
          <p className="text-sm text-amber-900 border border-amber-300 bg-amber-50 rounded p-3 mb-4">
            ⚠️ Certains articles ont été commandés par l'entreprise <strong>sans validation de votre part dans cette application</strong>. Ils sont identifiés individuellement avec le motif déclaré par l'entreprise. Leurs commandes ne sont pas couvertes par votre validation des autres articles.
          </p>
        )}
        
        <ul className="space-y-4">
          {fournitures.map((item) => {
            const estRefuse = articlesRefuses.includes(item.id);
            const estVerrouille = item.est_valide || item.commande_sans_validation_client;
            const estCommande = item.commande_passee;
            const estException = Boolean(item.commande_sans_validation_client); 

            return (
              <li key={item.id} className={`flex flex-col p-4 rounded border transition-colors ${estException ? "bg-amber-50 border-amber-300" : estRefuse ? "bg-red-50 border-red-200" : estVerrouille ? "bg-green-50 border-green-100" : "bg-white"}`}>
                
                <div className="flex gap-4">
                  {item.photo_url && (
                    <img src={item.photo_url} alt="Photo produit" className={`w-24 h-24 object-cover rounded border flex-shrink-0 ${estRefuse && !estException ? "opacity-50 grayscale" : ""}`} />
                  )}
                  
                  <div className={`flex-1 flex flex-col justify-center ${estRefuse && !estException ? "line-through opacity-70" : ""}`}>
                    <span className="font-bold text-lg">{item.designation}</span>
                    <div className="text-sm text-gray-600 mt-1 grid grid-cols-1 gap-1">
                      <span className="font-medium text-black">Quantité : {item.quantite}</span>
                      {item.fournisseur && <span>Fournisseur : {item.fournisseur}</span>}
                      {item.reference && <span>Réf : {item.reference}</span>}
                      {item.lien && <a href={item.lien} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Voir la fiche produit</a>}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center justify-center border-l pl-4 min-w-[120px]">
                    {estException ? (
                      <div className="text-center text-amber-950 max-w-[145px]">
                        <span className="text-2xl">⚠️</span>
                        <span className="block text-xs font-bold mt-1">Commandé par l'entreprise SANS validation du client</span>
                      </div>
                    ) : estCommande ? (
                      <div className="text-center">
                        <span className="text-2xl" title="Article en cours de commande">🔒</span>
                        <span className="block text-xs font-bold text-blue-700 mt-1">Commandé</span>
                      </div>
                    ) : estVerrouille ? (
                      <div className="text-center">
                        <span className="text-2xl">✅</span>
                        <span className="block text-xs font-bold text-green-700 mt-1">Validé</span>
                      </div>
                    ) : !toutEstValide ? (
                      <div className="w-full flex flex-col gap-2">
                        {estRefuse ? (
                          <>
                            <span className="text-xs font-bold bg-red-200 text-red-800 px-2 py-1 rounded text-center">❌ REFUSÉ</span>
                            <button onClick={() => basculerRefus(item.id, estVerrouille, estCommande)} className="text-xs bg-gray-200 text-gray-800 px-2 py-2 rounded font-bold hover:bg-gray-300 transition-colors">
                              ↩️ Remettre
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded text-center border border-green-200">✅ Prévu</span>
                            <button onClick={() => basculerRefus(item.id, estVerrouille, estCommande)} className="text-xs bg-white border border-red-300 text-red-600 px-2 py-2 rounded font-bold hover:bg-red-50 transition-colors">
                              ❌ Refuser
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {estException && (
                  <div className="mt-4 p-3 bg-amber-100 border border-amber-300 rounded text-sm">
                    <p className="font-bold text-amber-950">{item.refuse ? "Article initialement refusé par le client, commandé malgré ce refus" : "Commande sans validation du client"}</p>
                    <p className="mt-1 text-amber-900 whitespace-pre-wrap">Motif indiqué par l'entreprise : {item.justification_commande_sans_validation || "Non renseigné"}</p>
                    {item.date_commande_sans_validation && <p className="text-xs mt-1 text-amber-800">Commande enregistrée le {new Date(item.date_commande_sans_validation).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</p>}
                  </div>
                )}
                {item.question_artisan && (
                  <div className={`mt-4 bg-blue-50 p-3 rounded-lg border border-blue-200 ${estRefuse ? "opacity-50" : ""}`}>
                    <p className="text-sm font-semibold text-blue-900 mb-2">
                      💬 Question de votre artisan : <span className="font-normal italic">{item.question_artisan}</span>
                    </p>
                    <textarea 
                      className="w-full border border-blue-200 p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder={estVerrouille ? "Vous avez déjà validé cette réponse." : "Tapez votre réponse ici..."}
                      rows={2}
                      value={reponses[item.id] || ""}
                      onChange={(e) => handleReponseChange(item.id, e.target.value)}
                      disabled={estVerrouille || toutEstValide || estRefuse || estCommande}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="bg-gray-50 p-4 rounded-md mb-6 border">
        <h2 className="font-semibold text-gray-800 mb-2">📝 Remarque générale :</h2>
        
        {/* MODIFICATION : On affiche l'historique des remarques figees */}
        {chantier.commentaire_client && (
          <div className="mb-4 bg-white p-3 rounded border border-gray-200 text-gray-700 whitespace-pre-wrap text-sm">
            {chantier.commentaire_client}
          </div>
        )}

        {/* MODIFICATION : Champ uniquement pour AJOUTER un nouveau message */}
        {validationPossible && (
          <textarea
            className="w-full border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder={chantier.commentaire_client ? "Ajouter une remarque supplémentaire..." : "Une information complémentaire à transmettre à votre artisan ? Tapez-la ici..."}
            value={nouveauCommentaire}
            onChange={(e) => setNouveauCommentaire(e.target.value)}
          ></textarea>
        )}
      </div>

      {!validationPossible ? (
        <div className="bg-gray-100 text-gray-800 p-4 rounded-md text-center font-semibold border">
          {aDesCommandesExceptionnelles
            ? "Les articles identifiés comme commandes sans validation client ne sont pas considérés comme approuvés par vous. Aucune action supplémentaire n'est demandée pour ces commandes."
            : toutEstValide ? "Vos fournitures ont été validées. Merci !" : "Aucun article n'est actuellement à valider."}
        </div>
      ) : (
        <button 
          onClick={validerFournitures} 
          disabled={validationEnCours}
          className={`w-full text-white font-bold py-4 rounded-md shadow-md transition-colors ${validationEnCours ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {validationEnCours ? "Validation en cours..." : "Je valide uniquement les articles en attente et mes réponses"}
        </button>
      )}
    </div>
  );
}