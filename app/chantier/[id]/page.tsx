"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function PageChantier() {
  const params = useParams();
  const id = params.id as string;

  const [chantier, setChantier] = useState<any>(null);
  const [fournitures, setFournitures] = useState<any[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);

  const [designation, setDesignation] = useState("");
  const [quantite, setQuantite] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [reference, setReference] = useState("");
  const [lien, setLien] = useState("");
  const [questionArtisan, setQuestionArtisan] = useState(""); 
  const [fichierPhoto, setFichierPhoto] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (id) fetchChantierEtFournitures();
  }, [id]);

  async function fetchChantierEtFournitures() {
    const { data: chantierData } = await supabase.from("chantiers").select("*").eq("id", id).single();
    if (chantierData) setChantier(chantierData);

    const { data: fournituresData } = await supabase.from("fournitures").select("*").eq("chantier_id", id).order("created_at", { ascending: true });
    if (fournituresData) setFournitures(fournituresData);
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        setFichierPhoto(file);
      } else {
        alert("Veuillez déposer un fichier image.");
      }
    }
  };

  const editerFourniture = (item: any) => {
    setEditingId(item.id);
    setDesignation(item.designation || "");
    setQuantite(item.quantite || "");
    setFournisseur(item.fournisseur || "");
    setReference(item.reference || "");
    setLien(item.lien || "");
    setQuestionArtisan(item.question_artisan || "");
    setFichierPhoto(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const annulerEdition = () => {
    setEditingId(null);
    setDesignation("");
    setQuantite("");
    setFournisseur("");
    setReference("");
    setLien("");
    setQuestionArtisan("");
    setFichierPhoto(null);
  };

  async function ajouterOuModifierFourniture(e: React.FormEvent) {
    e.preventDefault();
    setIsUploading(true);
    let photoUrlFinal = "";

    if (fichierPhoto) {
      const fileExt = fichierPhoto.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, fichierPhoto);
      
      if (!uploadError) {
        const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
        photoUrlFinal = data.publicUrl;
      }
    }

    const payload: any = { 
      chantier_id: id, 
      designation, 
      quantite, 
      fournisseur, 
      reference, 
      lien, 
      question_artisan: questionArtisan,
      est_valide: false,
      refuse: false
    };

    if (photoUrlFinal) {
      payload.photo_url = photoUrlFinal;
    }

    let erreurRequete = null;

    if (editingId) {
      const { error } = await supabase.from("fournitures").update(payload).eq("id", editingId);
      erreurRequete = error;
    } else {
      const { error } = await supabase.from("fournitures").insert([payload]);
      erreurRequete = error;
    }

    if (!erreurRequete) {
      if (chantier.statut === "valide" || chantier.statut === "commande_passee") {
        await supabase.from("chantiers").update({ statut: "brouillon" }).eq("id", id);
        // MODIFICATION ICI POUR LE MESSAGE D'ALERTE
        alert(editingId ? "Article modifié ! Le chantier repasse en 'En cours de modification'." : "Article ajouté ! Le chantier repasse en 'En cours de modification'.");
      } else if (editingId) {
        alert("Modifications enregistrées !");
      }
      
      annulerEdition();
      fetchChantierEtFournitures();
    } else {
      alert("Erreur lors de l'enregistrement : " + erreurRequete.message);
    }
    setIsUploading(false);
  }

  async function supprimerFourniture(articleId: string) {
    if (!confirm("Voulez-vous vraiment supprimer cet article ?")) return;

    const { error } = await supabase.from("fournitures").delete().eq("id", articleId);

    if (error) {
      alert("Erreur lors de la suppression : " + error.message);
    } else {
      setFournitures((prev) => prev.filter((item) => item.id !== articleId));
    }
  }

  async function marquerArticleCommande(idFourniture: string, statutActuel: boolean) {
    const { error } = await supabase
      .from("fournitures")
      .update({ commande_passee: !statutActuel })
      .eq("id", idFourniture);
    
    if (!error) {
      fetchChantierEtFournitures();
    } else {
      alert("Erreur lors de la mise à jour de l'article.");
    }
  }

  async function marquerCommandePassee() {
    const { error } = await supabase.from("chantiers").update({ statut: "commande_passee" }).eq("id", id);
    if (!error) { fetchChantierEtFournitures(); alert("Dossier clôturé. Le harcèlement par email est arrêté !"); }
  }

  const formaterDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  const exporterVersExcel = () => {
    const enTetes = ["Fournisseur", "Article", "Reference", "Quantite", "Question", "Réponse Client", "Lien", "Photo", "Statut", "Date de validation", "Commandé"];
    
    const dateVal = (chantier.statut === "valide" || chantier.statut === "commande_passee") && chantier.date_validation 
      ? formaterDate(chantier.date_validation) 
      : "En attente";

    const lignes = fournitures.map(f => [
      `"${(f.fournisseur || "").replace(/"/g, '""')}"`,
      `"${f.designation.replace(/"/g, '""')}"`,
      `"${(f.reference || "").replace(/"/g, '""')}"`,
      `"${f.quantite.replace(/"/g, '""')}"`,
      `"${(f.question_artisan || "").replace(/"/g, '""')}"`,
      `"${(f.reponse_client || "").replace(/"/g, '""')}"`,
      `"${(f.lien || "").replace(/"/g, '""')}"`,
      `"${(f.photo_url || "").replace(/"/g, '""')}"`,
      f.refuse ? "Refusé" : "Validé",
      `"${dateVal}"`,
      f.commande_passee ? "Oui" : "Non"
    ]);
    
    const csvContent = [enTetes.join(";"), ...lignes.map(l => l.join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Fournitures_${chantier.nom_client.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const telechargerPreuvePDF = () => {
    if (chantier.statut !== "valide" && chantier.statut !== "commande_passee") {
      alert("Le chantier n'a pas encore été validé par le client.");
      return;
    }

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Certificat de Validation des Fournitures", 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Chantier / Client : ${chantier.nom_client}`, 14, 30);
    
    const dateValidation = chantier.date_validation 
      ? formaterDate(chantier.date_validation) 
      : "Date inconnue";
      
    doc.text(`Date de validation officielle : ${dateValidation}`, 14, 36);
    doc.text("Ce document atteste l'approbation des fournitures listées ci-dessous.", 14, 42);

    const colonnes = ["Désignation", "Qté", "Fournisseur", "Référence", "Réponse Client"];
    const lignes = fournitures
      .filter(item => !item.refuse) 
      .map(item => [
        item.designation,
        item.quantite,
        item.fournisseur || "-",
        item.reference || "-",
        item.reponse_client || "-"
      ]);

    autoTable(doc, {
      head: [colonnes],
      body: lignes,
      startY: 50,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`Preuve_Validation_${chantier.nom_client.replace(/\s+/g, '_')}.pdf`);
  };

  if (!chantier) return <div className="p-8 font-bold">Chargement...</div>;
  const lienValidation = typeof window !== "undefined" ? `${window.location.origin}/validation/${chantier.token_validation}` : "";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link href="/" className="text-gray-500 hover:text-black mb-6 inline-block font-bold">&larr; Retour</Link>
      
      <div className="flex justify-between items-start mb-8 pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold">{chantier.nom_client}</h1>
          {/* MODIFICATION ICI POUR L'AFFICHAGE DU STATUT */}
          <p className="text-gray-600 mt-1">STATUT : <strong className="uppercase">{chantier.statut === 'brouillon' ? 'EN COURS DE MODIFICATION' : chantier.statut}</strong></p>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
           <div className="flex gap-2">
             <button onClick={exporterVersExcel} className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700">📊 Exporter Excel</button>
             {(chantier.statut === "valide" || chantier.statut === "commande_passee") && (
               <button onClick={telechargerPreuvePDF} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">📄 Preuve PDF</button>
             )}
           </div>
           {(chantier.statut === "valide" || chantier.statut === "commande_passee") && chantier.date_validation && (
            <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded border mt-2">
              🔒 Validé le : <strong>{formaterDate(chantier.date_validation)}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className={`p-6 rounded-lg border h-fit transition-colors ${editingId ? "bg-yellow-50 border-yellow-300 shadow-md" : "bg-white border-gray-200"}`}>
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? "✏️ Modifier l'article" : "Ajouter un article"}
          </h2>
          <form onSubmit={ajouterOuModifierFourniture} className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Article *" className="border p-3 rounded col-span-2 bg-white" value={designation} onChange={(e) => setDesignation(e.target.value)} required />
            <input type="text" placeholder="Quantité *" className="border p-3 rounded bg-white" value={quantite} onChange={(e) => setQuantite(e.target.value)} required />
            <input type="text" placeholder="Fournisseur" className="border p-3 rounded bg-white" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
            <input type="text" placeholder="Référence" className="border p-3 rounded bg-white" value={reference} onChange={(e) => setReference(e.target.value)} />
            <input type="url" placeholder="Lien URL de l'article" className="border p-3 rounded col-span-2 bg-white" value={lien} onChange={(e) => setLien(e.target.value)} />
            
            <div className="col-span-2 border-t pt-4 mt-2">
              <label className="block text-sm font-bold text-blue-800 mb-1">💬 Poser une question au client (Optionnel)</label>
              <input 
                type="text" 
                placeholder="Ex: Quel emplacement pour ce carrelage ?" 
                className="w-full border border-blue-200 bg-blue-50 p-3 rounded" 
                value={questionArtisan} 
                onChange={(e) => setQuestionArtisan(e.target.value)} 
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Photo (optionnelle)</label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors bg-white ${
                  isDragging ? "border-blue-500 bg-blue-50" : fichierPhoto ? "border-green-500 bg-green-50" : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => setFichierPhoto(e.target.files ? e.target.files[0] : null)}
                />
                {fichierPhoto ? (
                  <div className="text-sm text-green-700 font-medium">
                    📷 Photo sélectionnée : <strong>{fichierPhoto.name}</strong>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    📂 <strong>Glissez-déposez une photo ici</strong> ou cliquez pour la parcourir
                    {editingId && <span className="block text-xs mt-1 text-gray-400">(Laissez vide pour conserver la photo actuelle)</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={isUploading} className="flex-1 bg-black text-white py-3 rounded font-bold hover:bg-gray-800 disabled:bg-gray-400">
                {isUploading ? "Enregistrement..." : editingId ? "Enregistrer les modifications" : "Ajouter à la liste"}
              </button>
              {editingId && (
                <button type="button" onClick={annulerEdition} className="px-6 bg-gray-300 text-black py-3 rounded font-bold hover:bg-gray-400">
                  Annuler
                </button>
              )}
            </div>
          </form>
        </div>

        <div>
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
            <h2 className="text-xl font-semibold mb-4">Liste actuelle</h2>
            {fournitures.length === 0 ? <p className="text-gray-500 italic">Vide.</p> : (
              <ul className="space-y-4">
                {fournitures.map((item) => (
                  <li key={item.id} className={`flex flex-col p-4 border rounded shadow-sm ${item.refuse ? "bg-red-50 border-red-200" : "bg-white"} ${editingId === item.id ? "border-yellow-400 ring-2 ring-yellow-200" : ""}`}>
                    <div className="flex gap-4">
                      {item.photo_url && (
                        <img src={item.photo_url} alt="Photo" className={`w-20 h-20 object-cover rounded border ${item.refuse ? "opacity-50 grayscale" : ""}`} />
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <span className={`font-bold ${item.refuse ? "line-through text-red-500" : ""}`}>
                            {item.designation} 
                            {item.est_valide && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">✅ Validé</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-black bg-gray-100 px-2 py-1 rounded text-sm">{item.quantite}</span>
                            
                            {!item.commande_passee ? (
                              <>
                                <button 
                                  onClick={() => editerFourniture(item)}
                                  className="text-blue-500 hover:text-blue-700 text-lg ml-2"
                                  title="Modifier cet article"
                                >
                                  ✏️
                                </button>
                                <button 
                                  onClick={() => supprimerFourniture(item.id)}
                                  className="text-red-500 hover:text-red-700 text-lg ml-2"
                                  title="Supprimer cet article"
                                >
                                  🗑️
                                </button>
                              </>
                            ) : (
                              <span className="ml-2 text-gray-400 text-lg cursor-not-allowed" title="Article verrouillé car déjà commandé">🔒</span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {item.fournisseur && <span>🛒 {item.fournisseur}</span>}
                          {item.reference && <span>🏷️ Ref: {item.reference}</span>}
                          {item.lien && <a href={item.lien} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">🔗 Voir le produit</a>}
                        </div>
                        
                        {item.question_artisan && (
                          <div className="mt-3 bg-blue-50 p-3 rounded border border-blue-200 text-sm">
                            <p className="font-semibold text-blue-900">Vous avez demandé : <span className="font-normal italic">{item.question_artisan}</span></p>
                            {item.reponse_client ? (
                              <p className="mt-1 text-green-700 font-bold">Réponse : {item.reponse_client}</p>
                            ) : (
                              <p className="mt-1 text-gray-500 italic">⏳ En attente de la réponse du client...</p>
                            )}
                          </div>
                        )}

                        {item.refuse && <span className="text-xs font-bold text-red-600 block mt-2">❌ REFUSÉ</span>}
                      </div>
                    </div>
                    
                    {item.est_valide && !item.refuse && (
                      <div className="mt-4 pt-3 border-t flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">État de la commande :</span>
                        <button
                          onClick={() => marquerArticleCommande(item.id, item.commande_passee)}
                          className={`px-4 py-1.5 text-sm font-bold rounded transition-colors ${
                            item.commande_passee 
                              ? "bg-blue-600 text-white hover:bg-blue-700" 
                              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                          }`}
                        >
                          {item.commande_passee ? "✅ Commandé" : "⏳ À commander"}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {chantier.statut === "valide" && (
            <div className="mt-6 p-6 border rounded-lg bg-green-50 border-green-200 text-center">
               <p className="text-sm text-green-800 mb-3">Toutes les fournitures ont été commandées ?</p>
               <button onClick={marquerCommandePassee} className="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700">
                Clôturer les commandes (Arrêter les rappels)
              </button>
            </div>
          )}
          
          <div className="mt-6">
            <p className="text-sm font-bold mb-2">Lien client :</p>
            <input type="text" readOnly value={lienValidation} className="w-full border p-2 text-sm bg-gray-100" />
            <button 
              onClick={() => {
                navigator.clipboard.writeText(lienValidation);
                alert("Lien copié !");
              }}
              className="mt-2 w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700"
            >
              Copier le lien
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}