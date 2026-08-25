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
  // NOUVEAU : État pour le commentaire global du client
  const [commentaireClient, setCommentaireClient] = useState("");

  useEffect(() => {
    async function fetchDonnees() {
      const { data: chantierData } = await supabase.from("chantiers").select("*").eq("token_validation", token).single();
      if (chantierData) {
        setChantier(chantierData);
        setCommentaireClient(chantierData.commentaire_client || ""); // Charge le commentaire existant

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
    // SECURITE : Impossible de refuser si c'est validé, si le chantier est clos, ou si c'est déjà commandé
    if (estValide || chantier.statut === "valide" || chantier.statut === "commande_passee" || estCommande) return;
    setArticlesRefuses((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
  };

  const handleReponseChange = (id: string, texte: string) => {
    setReponses(prev => ({ ...prev, [id]: texte }));
  };

  const validerFournitures = async () => {
    setValidationEnCours(true);
    
    try {
      for (const item of fournitures) {
        if (!item.est_valide) {
          const estRefuse = articlesRefuses.includes(item.id);
          const reponseClient = reponses[item.id] || null;
          
          const { error: errFourniture } = await supabase.from("fournitures").update({ 
            refuse: estRefuse,
            est_valide: true,
            reponse_client: reponseClient 
          }).eq("id", item.id);

          if (errFourniture) {
            alert(`Erreur technique sur l'article "${item.designation}" : ${errFourniture.message}`);
            setValidationEnCours(false);
            return;
          }
        }
      }
      
      // NOUVEAU : On enregistre le commentaire client en même temps que la validation
      const { error: errChantier } = await supabase.from("chantiers").update({ 
        statut: "valide", 
        date_validation: new Date().toISOString(),
        commentaire_client: commentaireClient
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

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 mt-10 bg-white shadow-lg rounded-lg border">
      <h1 className="text-2xl font-bold mb-2">Validation des fournitures</h1>
      <p className="text-gray-600 mb-6">Chantier : {chantier.nom_client}</p>

      <div className="bg-gray-50 p-4 rounded-md mb-6 border">
        <h2 className="font-semibold mb-2 border-b pb-2">Matériel prévu :</h2>
        {!toutEstValide && <p className="text-sm text-blue-600 mb-4 font-medium">De nouveaux articles ont été ajoutés. Veuillez vérifier, répondre aux questions éventuelles et valider ci-dessous.</p>}
        
        <ul className="space-y-4">
          {fournitures.map((item) => {
            const estRefuse = articlesRefuses.includes(item.id);
            const estVerrouille = item.est_valide;
            const estCommande = item.commande_passee; // On vérifie si vous avez commandé

            return (
              <li key={item.id} className={`flex flex-col p-4 rounded border transition-colors ${estRefuse ? "bg-red-50 border-red-200" : estVerrouille ? "bg-green-50 border-green-100" : "bg-white"}`}>
                
                <div className="flex gap-4">
                  {item.photo_url && (
                    <img src={item.photo_url} alt="Photo produit" className={`w-24 h-24 object-cover rounded border flex-shrink-0 ${estRefuse ? "opacity-50 grayscale" : ""}`} />
                  )}
                  
                  <div className={`flex-1 flex flex-col justify-center ${estRefuse ? "line-through opacity-70" : ""}`}>
                    <span className="font-bold text-lg">{item.designation}</span>
                    <div className="text-sm text-gray-600 mt-1 grid grid-cols-1 gap-1">
                      <span className="font-medium text-black">Quantité : {item.quantite}</span>
                      {item.fournisseur && <span>Fournisseur : {item.fournisseur}</span>}
                      {item.reference && <span>Réf : {item.reference}</span>}
                      {item.lien && <a href={item.lien} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Voir la fiche produit</a>}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center justify-center border-l pl-4 min-w-[80px]">
                    {/* Logique d'affichage des boutons d'action du client */}
                    {estCommande ? (
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
                      <button onClick={() => basculerRefus(item.id, estVerrouille, estCommande)} className={`w-10 h-10 flex items-center justify-center rounded-full border text-xl ${estRefuse ? "bg-red-100 border-red-300" : "bg-gray-100 border-gray-300 hover:bg-gray-200"}`}>
                        {estRefuse ? "↩️" : "❌"}
                      </button>
                    ) : null}
                    
                    {estRefuse && !estCommande && <span className="text-xs font-bold bg-red-200 text-red-800 px-2 py-1 rounded text-center mt-2">REFUSÉ</span>}
                  </div>
                </div>

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

      {/* NOUVEAU : Zone de commentaire global */}
      <div className="bg-gray-50 p-4 rounded-md mb-6 border">
        <h2 className="font-semibold text-gray-800 mb-2">📝 Remarque générale (Optionnel) :</h2>
        <textarea
          className="w-full border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-600"
          rows={4}
          placeholder="Une information complémentaire à transmettre à votre artisan ? Tapez-la ici..."
          value={commentaireClient}
          onChange={(e) => setCommentaireClient(e.target.value)}
          disabled={toutEstValide} // On bloque la modification si c'est déjà validé
        ></textarea>
      </div>

      {toutEstValide ? (
        <div className="bg-green-100 text-green-800 p-4 rounded-md text-center font-bold shadow-inner">
          ✅ Vous avez validé toutes les fournitures. Merci !
        </div>
      ) : (
        <button 
          onClick={validerFournitures} 
          disabled={validationEnCours}
          className={`w-full text-white font-bold py-4 rounded-md shadow-md transition-colors ${validationEnCours ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {validationEnCours ? "Validation en cours..." : "Je valide mes choix et mes réponses"}
        </button>
      )}
    </div>
  );
}