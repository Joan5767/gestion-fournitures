"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function TableauDeBord() {
  const [chantiers, setChantiers] = useState<any[]>([]);
  const [nomClient, setNomClient] = useState("");
  const [adresseClient, setAdresseClient] = useState("");
  
  // Nouvel état pour la barre de recherche
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    fetchChantiers();
  }, []);

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

  // Fonction utilitaire pour formater la date au format français
  const formaterDateRecherche = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("fr-FR");
  };

  // Filtrage des chantiers en temps réel
  const chantiersFiltres = chantiers.filter((chantier) => {
    const texteRecherche = recherche.toLowerCase();
    const nom = (chantier.nom_client || "").toLowerCase();
    const adresse = (chantier.adresse_client || "").toLowerCase();
    const dateCreation = formaterDateRecherche(chantier.created_at);

    return (
      nom.includes(texteRecherche) ||
      adresse.includes(texteRecherche) ||
      dateCreation.includes(texteRecherche)
    );
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Mes Chantiers</h1>
      
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

      {/* BARRE DE RECHERCHE */}
      <div className="mb-6">
        <input 
          type="text" 
          placeholder="🔍 Rechercher un chantier par nom, adresse ou date (ex: 25/08/2026)..." 
          className="w-full border p-3 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="grid gap-4">
        {/* On utilise chantiersFiltres au lieu de chantiers pour l'affichage */}
        {chantiersFiltres.map((chantier) => (
          <div key={chantier.id} className="border p-4 rounded-lg flex justify-between items-center shadow-sm bg-white">
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
                  {chantier.statut.toUpperCase()}
                </span>
                <span className="text-xs text-gray-400">
                  Créé le {formaterDateRecherche(chantier.created_at)}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
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
        ))}
        
        {/* Messages si aucun résultat */}
        {chantiers.length > 0 && chantiersFiltres.length === 0 && (
          <p className="text-gray-500 italic">Aucun chantier ne correspond à votre recherche.</p>
        )}
        {chantiers.length === 0 && (
          <p className="text-gray-500 italic">Aucun chantier pour le moment.</p>
        )}
      </div>
    </div>
  );
}