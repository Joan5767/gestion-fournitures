"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function TableauDeBord() {
  const [estAuthentifie, setEstAuthentifie] = useState(false);

  const [chantiers, setChantiers] = useState<any[]>([]);
  const [nomClient, setNomClient] = useState("");
  const [adresseClient, setAdresseClient] = useState("");
  
  const [afficherRecherche, setAfficherRecherche] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  // NOUVEAU : États pour gérer les menus déroulants des mémos
  const [memosDeplies, setMemosDeplies] = useState<{ [key: string]: boolean }>({});
  const [nouveauxMemos, setNouveauxMemos] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/login";
      } else {
        setEstAuthentifie(true);
      }
    });
  }, []);

  useEffect(() => {
    if (estAuthentifie) {
      fetchChantiers();
    }
  }, [estAuthentifie]);

  async function fetchChantiers() {
    const { data, error } = await supabase
      .from("chantiers")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (data) setChantiers(data);
  }

  async function creerChantier(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("chantiers")
      .insert([{ nom_client: nomClient, adresse_client: adresseClient }]);

    if (error) {
      alert("Erreur Supabase : " + error.message);
      console.error(error);
      return;
    }
    
    setNomClient("");
    setAdresseClient("");
    fetchChantiers();
  }

  async function supprimerChantier(id: string) {
    const confirmation = window.confirm("Êtes-vous sûr de vouloir supprimer définitivement ce chantier ? Cette action est irréversible.");
    if (!confirmation) return;

    await supabase.from("fournitures").delete().eq("chantier_id", id);
    const { error } = await supabase.from("chantiers").delete().eq("id", id);
    
    if (error) {
      alert("Erreur lors de la suppression : " + error.message);
    } else {
      fetchChantiers(); 
    }
  }

  // NOUVEAU : Gérer l'ouverture/fermeture du menu mémo
  const toggleMemos = (id: string) => {
    setMemosDeplies(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // NOUVEAU : Ajouter un mémo daté
  async function ajouterMemo(chantierId: string) {
    const texte = nouveauxMemos[chantierId];
    if (!texte || !texte.trim()) return;

    const chantier = chantiers.find(c => c.id === chantierId);
    const memosActuels = chantier.historique_memos || [];
    
    // Création du nouvel objet mémo avec ID unique et date
    const nouveauMemo = {
      id: Date.now().toString(),
      texte: texte.trim(),
      date: new Date().toISOString()
    };
    
    const listeMiseAJour = [...memosActuels, nouveauMemo];

    const { error } = await supabase
      .from("chantiers")
      .update({ historique_memos: listeMiseAJour })
      .eq("id", chantierId);

    if (!error) {
      setChantiers(chantiers.map(c => c.id === chantierId ? { ...c, historique_memos: listeMiseAJour } : c));
      setNouveauxMemos(prev => ({ ...prev, [chantierId]: "" })); // Vider le champ
    } else {
      alert("Erreur lors de l'ajout du mémo.");
    }
  }

  // NOUVEAU : Supprimer un mémo spécifique
  async function supprimerMemo(chantierId: string, memoId: string) {
    if (!confirm("Effacer ce mémo ?")) return;

    const chantier = chantiers.find(c => c.id === chantierId);
    const listeMiseAJour = (chantier.historique_memos || []).filter((m: any) => m.id !== memoId);

    const { error } = await supabase
      .from("chantiers")
      .update({ historique_memos: listeMiseAJour })
      .eq("id", chantierId);

    if (!error) {
      setChantiers(chantiers.map(c => c.id === chantierId ? { ...c, historique_memos: listeMiseAJour } : c));
    }
  }

  const formaterDateAffichage = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("fr-FR");
  };

  const formaterDateHeure = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  const chantiersFiltres = chantiers.filter((chantier) => {
    const texteRecherche = recherche.toLowerCase();
    const nom = (chantier.nom_client || "").toLowerCase();
    const adresse = (chantier.adresse_client || "").toLowerCase();
    const correspondTexte = nom.includes(texteRecherche) || adresse.includes(texteRecherche);

    let correspondDate = true;
    if (dateDebut || dateFin) {
      const dateChantier = new Date(chantier.created_at).getTime();
      
      if (dateDebut) {
        const debut = new Date(dateDebut).getTime();
        if (dateChantier < debut) correspondDate = false;
      }
      
      if (dateFin) {
        const fin = new Date(dateFin).getTime() + 86400000;
        if (dateChantier > fin) correspondDate = false;
      }
    }

    return correspondTexte && correspondDate;
  });

  if (!estAuthentifie) {
    return <div className="p-20 text-center font-bold text-xl text-gray-600">Vérification de sécurité en cours...</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Mes Chantiers</h1>
        <button 
          onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
          className="text-red-600 hover:text-red-800 font-bold text-sm bg-red-50 px-4 py-2 rounded border border-red-200"
        >
          Déconnexion
        </button>
      </div>
      
      <div className="bg-gray-100 p-6 rounded-lg mb-8 border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Créer un nouveau chantier</h2>
        <form onSubmit={creerChantier} className="flex gap-4 flex-wrap">
          <input 
            type="text" 
            placeholder="Nom du client *" 
            className="border p-2 rounded flex-1 min-w-[200px]"
            value={nomClient}
            onChange={(e) => setNomClient(e.target.value)}
            required
          />
          <input 
            type="text" 
            placeholder="Adresse du chantier (optionnel)" 
            className="border p-2 rounded flex-1 min-w-[200px]"
            value={adresseClient}
            onChange={(e) => setAdresseClient(e.target.value)}
          />
          <button type="submit" className="bg-black text-white px-6 py-2 rounded font-bold hover:bg-gray-800">
            Créer
          </button>
        </form>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Liste des chantiers ({chantiersFiltres.length})</h2>
        <button 
          onClick={() => setAfficherRecherche(!afficherRecherche)}
          className={`px-4 py-2 rounded font-bold text-sm transition-colors ${
            afficherRecherche ? "bg-gray-300 text-gray-800 hover:bg-gray-400" : "bg-blue-100 text-blue-800 hover:bg-blue-200"
          }`}
        >
          {afficherRecherche ? "Fermer la recherche ✖" : "Rechercher 🔍"}
        </button>
      </div>

      {afficherRecherche && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6 flex flex-col md:flex-row gap-4 items-center animate-fade-in">
          <div className="flex-1 w-full">
            <label className="block text-xs text-blue-800 font-bold mb-1 uppercase">Recherche libre</label>
            <input 
              type="text" 
              placeholder="Nom ou adresse du client..." 
              className="w-full border p-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto items-end">
            <div>
              <label className="block text-xs text-blue-800 font-bold mb-1 uppercase">Du (inclus)</label>
              <input 
                type="date" 
                className="border p-2 rounded shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-blue-800 font-bold mb-1 uppercase">Au (inclus)</label>
              <input 
                type="date" 
                className="border p-2 rounded shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </div>
            
            {(dateDebut || dateFin || recherche) && (
              <button 
                onClick={() => { setDateDebut(""); setDateFin(""); setRecherche(""); }}
                className="text-red-500 hover:text-red-700 font-bold text-sm px-2 pb-2"
                title="Effacer tous les filtres"
              >
                ✖
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {chantiersFiltres.map((chantier) => {
          const nbMemos = chantier.historique_memos ? chantier.historique_memos.length : 0;
          const estDeplie = memosDeplies[chantier.id] || false;

          return (
            <div key={chantier.id} className="border p-4 rounded-lg flex flex-col shadow-sm bg-white">
              
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{chantier.nom_client}</h3>
                  {chantier.adresse_client && (
                    <p className="text-sm text-gray-500 mb-2 mt-1">📍 {chantier.adresse_client}</p>
                  )}
                  {!chantier.adresse_client && <div className="mb-2 mt-1"></div>}
                  
                  <div className="flex gap-2 items-center">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      chantier.statut === 'brouillon' ? 'bg-gray-200 text-gray-800' : 
                      chantier.statut === 'valide' ? 'bg-green-200 text-green-800' : 
                      chantier.statut === 'commande_passee' ? 'bg-blue-200 text-blue-800' : 'bg-yellow-200 text-yellow-800'
                    }`}>
                      {chantier.statut === 'brouillon' ? 'EN COURS DE MODIFICATION' : chantier.statut.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-400">
                      Créé le {formaterDateAffichage(chantier.created_at)}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row items-end md:items-center gap-3">
                  {/* NOUVEAU : Bouton pour déplier les mémos */}
                  <button 
                    onClick={() => toggleMemos(chantier.id)}
                    className={`text-sm px-3 py-1.5 rounded font-bold border transition-colors ${estDeplie ? "bg-yellow-100 border-yellow-300 text-yellow-800" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}
                  >
                    📝 Mémos ({nbMemos}) {estDeplie ? "▲" : "▼"}
                  </button>
                  
                  <div className="flex items-center gap-2">
                    <Link href={`/chantier/${chantier.id}`} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium text-sm">
                      Gérer les fournitures
                    </Link>
                    <button 
                      onClick={() => supprimerChantier(chantier.id)}
                      className="text-red-500 hover:text-white border border-red-500 hover:bg-red-600 px-3 py-2 rounded font-bold transition-colors"
                      title="Supprimer ce chantier"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>

              {/* ZONE MÉMOS (Visible uniquement si dépliée) */}
              {estDeplie && (
                <div className="mt-4 pt-4 border-t border-gray-100 bg-yellow-50/50 rounded-b-lg p-2">
                  
                  {/* Champ d'ajout */}
                  <div className="flex gap-2 mb-4">
                    <input 
                      type="text" 
                      placeholder="Ajouter une note ou un mémo..."
                      value={nouveauxMemos[chantier.id] || ""}
                      onChange={(e) => setNouveauxMemos(prev => ({ ...prev, [chantier.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') ajouterMemo(chantier.id); }}
                      className="flex-1 border border-yellow-200 bg-white p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                    <button 
                      onClick={() => ajouterMemo(chantier.id)}
                      disabled={!nouveauxMemos[chantier.id]?.trim()}
                      className="bg-yellow-400 text-yellow-900 px-4 py-2 rounded text-sm font-bold hover:bg-yellow-500 disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </div>

                  {/* Liste des mémos */}
                  {nbMemos > 0 ? (
                    <ul className="space-y-2">
                      {chantier.historique_memos.slice().reverse().map((memo: any) => (
                        <li key={memo.id} className="flex justify-between items-start bg-white p-3 rounded border border-yellow-200 shadow-sm">
                          <div>
                            <span className="text-xs text-gray-400 block mb-1">⏰ {formaterDateHeure(memo.date)}</span>
                            <p className="text-sm text-gray-800">{memo.texte}</p>
                          </div>
                          <button 
                            onClick={() => supprimerMemo(chantier.id, memo.id)}
                            className="text-gray-400 hover:text-red-500 text-sm p-1 ml-2"
                            title="Supprimer ce mémo"
                          >
                            ✖
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 italic text-center py-2">Aucun mémo pour ce chantier.</p>
                  )}
                </div>
              )}

            </div>
          );
        })}
        
        {chantiers.length > 0 && chantiersFiltres.length === 0 && (
          <p className="text-gray-500 italic">Aucun chantier ne correspond à vos filtres.</p>
        )}
        {chantiers.length === 0 && (
          <p className="text-gray-500 italic">Aucun chantier pour le moment.</p>
        )}
      </div>
    </div>
  );
}