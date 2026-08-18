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

  useEffect(() => {
    async function fetchDonnees() {
      const { data: chantierData } = await supabase.from("chantiers").select("*").eq("token_validation", token).single();
      if (chantierData) {
        setChantier(chantierData);

        const { data: fournituresData } = await supabase.from("fournitures").select("*").eq("chantier_id", chantierData.id).order("created_at", { ascending: true });
        if (fournituresData) {
          setFournitures(fournituresData);
          setArticlesRefuses(fournituresData.filter(f => f.refuse).map(f => f.id));
        }
      }
      setLoading(false);
    }
    fetchDonnees();
  }, [token]);

  const basculerRefus = (id: string, estValide: boolean) => {
    if (estValide || chantier.statut === "valide" || chantier.statut === "commande_passee") return;
    setArticlesRefuses((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
  };

  const validerFournitures = async () => {
    setValidationEnCours(true);
    
    try {
      // 1. Verrouiller les nouveaux articles
      for (const item of fournitures) {
        if (!item.est_valide) {
          const estRefuse = articlesRefuses.includes(item.id);
          const { error: errFourniture } = await supabase.from("fournitures").update({ 
            refuse: estRefuse,
            est_valide: true 
          }).eq("id", item.id);

          if (errFourniture) {
            alert(`Erreur technique sur l'article "${item.designation}" : ${errFourniture.message}`);
            setValidationEnCours(false);
            return;
          }
        }
      }
      
      // 2. Valider le chantier
      const { error: errChantier } = await supabase.from("chantiers").update({ 
        statut: "valide", 
        date_validation: new Date().toISOString() 
      }).eq("id", chantier.id);
      
      if (errChantier) {
        alert(`Erreur lors de la validation globale : ${errChantier.message}`);
        setValidationEnCours(false);
        return;
      }

      // 3. Envoyer l'e-mail instantané à l'artisan via Resend
      await fetch("/api/notifier-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomClient: chantier.nom_client }),
      });

      alert("Vos choix ont été enregistrés avec succès !");
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
        {!toutEstValide && <p className="text-sm text-blue-600 mb-4 font-medium">De nouveaux articles ont été ajoutés. Veuillez les vérifier et valider ci-dessous.</p>}
        
        <ul className="space-y-4">
          {fournitures.map((item) => {
            const estRefuse = articlesRefuses.includes(item.id);
            const estVerrouille = item.est_valide;

            return (
              <li key={item.id} className={`flex gap-4 p-4 rounded border transition-colors ${estRefuse ? "bg-red-50 border-red-200" : estVerrouille ? "bg-green-50 border-green-100" : "bg-white"}`}>
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
                  {estVerrouille ? (
                    <div className="text-center">
                      <span className="text-2xl">🔒</span>
                      <span className="block text-xs font-bold text-green-700 mt-1">Déjà validé</span>
                    </div>
                  ) : !toutEstValide ? (
                    <button onClick={() => basculerRefus(item.id, estVerrouille)} className={`w-10 h-10 flex items-center justify-center rounded-full border text-xl ${estRefuse ? "bg-red-100 border-red-300" : "bg-gray-100 border-gray-300"}`}>
                      {estRefuse ? "↩️" : "❌"}
                    </button>
                  ) : null}
                  {estRefuse && <span className="text-xs font-bold bg-red-200 text-red-800 px-2 py-1 rounded text-center mt-2">REFUSÉ</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {toutEstValide ? (
        <div className="bg-green-100 text-green-800 p-4 rounded-md text-center font-bold">✅ Liste complète validée</div>
      ) : (
        <button 
          onClick={validerFournitures} 
          disabled={validationEnCours}
          className={`w-full text-white font-bold py-4 rounded-md shadow-md ${validationEnCours ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {validationEnCours ? "Validation en cours..." : "Je valide mes choix et les ajouts"}
        </button>
      )}
    </div>
  );
}