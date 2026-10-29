"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as ExcelJS from "exceljs";

export default function PageChantier() {
  const params = useParams();
  const id = params.id as string;

  const [estAuthentifie, setEstAuthentifie] = useState(false);

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

  const [articlesSelectionnes, setArticlesSelectionnes] = useState<string[]>([]);
  const [dateReceptionBulk, setDateReceptionBulk] = useState("");
  const [lieuReceptionBulk, setLieuReceptionBulk] = useState("");
  const [refCommandeBulk, setRefCommandeBulk] = useState("");
  const [receptionADefinirBulk, setReceptionADefinirBulk] = useState(false);

  // Une commande exceptionnelle ne constitue PAS une validation du client.
  const [articleCommandeExceptionnelle, setArticleCommandeExceptionnelle] = useState<string | null>(null);
  const [motifCommandeExceptionnelle, setMotifCommandeExceptionnelle] = useState("");
  const [enregistrementExceptionEnCours, setEnregistrementExceptionEnCours] = useState(false);
  const [editionMotifException, setEditionMotifException] = useState(false);

  // Consignes pour le conducteur de travaux : enregistrees dans les memos existants
  // du chantier pour eviter toute modification du schema de la base Supabase.
  const ID_CONSIGNES_CONDUCTEUR = "fiche_chantier_conducteur";
  const [consignesConducteur, setConsignesConducteur] = useState("");
  const [consignesEnregistrees, setConsignesEnregistrees] = useState("");
  const [sauvegardeConsignesEnCours, setSauvegardeConsignesEnCours] = useState(false);
  const [generationFicheEnCours, setGenerationFicheEnCours] = useState(false);
  const consignesChargeesPour = useRef<string | null>(null);

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
    if (id && estAuthentifie) fetchChantierEtFournitures();
  }, [id, estAuthentifie]);

  async function fetchChantierEtFournitures() {
    const { data: chantierData } = await supabase.from("chantiers").select("*").eq("id", id).single();
    if (chantierData) {
      setChantier(chantierData);
      // Ne pas effacer les consignes en cours de saisie lors de l'actualisation
      // des fournitures ou du statut du chantier.
      if (consignesChargeesPour.current !== id) {
        const memos = Array.isArray(chantierData.historique_memos) ? chantierData.historique_memos : [];
        const note = memos.find((memo: any) => memo.id === ID_CONSIGNES_CONDUCTEUR);
        const texte = typeof note?.texte === "string" ? note.texte : "";
        setConsignesConducteur(texte);
        setConsignesEnregistrees(texte);
        consignesChargeesPour.current = id;
      }
    }

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

  // Rétablir l'état « validé » après une commande exceptionnelle si la liste
  // avait déjà été validée et qu'il ne reste aucun article à faire valider.
  // Cet état de chantier ne signifie PAS que les commandes exceptionnelles
  // sont approuvées : seul « est_valide » enregistre l'accord du client.
  async function actualiserStatutApresCommandeExceptionnelle() {
    if (!chantier || chantier.statut !== "brouillon") return;
    const historiquePresent = Boolean(chantier.date_validation) ||
      (Array.isArray(chantier.historique_validations) && chantier.historique_validations.length > 0);
    if (!historiquePresent) return;

    const { data, error } = await supabase.from("fournitures")
      .select("est_valide,commande_sans_validation_client,commande_passee,refuse")
      .eq("chantier_id", id);
    if (error || !data) return;
    const aucunArticleEnAttente = data.every((item: any) =>
      item.est_valide || item.commande_sans_validation_client
    );
    if (aucunArticleEnAttente) {
      const avaitEteCloture = Array.isArray(chantier.historique_commandes) &&
        chantier.historique_commandes.length > 0;
      const toutesCommandesPassees = data.every((article: any) => article.refuse || article.commande_passee);
      // Si le dossier avait déjà été clôturé et que tout est commandé,
      // ne pas relancer inutilement les e-mails de rappel.
      const prochainStatut = avaitEteCloture && toutesCommandesPassees ? "commande_passee" : "valide";
      const { error: erreurStatut } = await supabase.from("chantiers")
        .update({ statut: prochainStatut }).eq("id", id).eq("statut", "brouillon");
      if (erreurStatut) {
        alert("Commande enregistrée, mais le statut du chantier n'a pas pu être actualisé : " + erreurStatut.message);
      }
    }
  }

  async function marquerArticleCommande(idFourniture: string, statutActuel: boolean) {
    const article = fournitures.find((item) => item.id === idFourniture);
    if (!article) return;

    if (statutActuel) {
      const confirmation = window.confirm("Annuler cette commande ? Son statut exceptionnel et son motif ne seront plus affichés sur les documents futurs.");
      if (!confirmation) return;
    } else if (!article.est_valide || article.refuse) {
      // Un article non validé OU refusé exige un motif avant la commande.
      setArticleCommandeExceptionnelle(idFourniture);
      setEditionMotifException(false);
      setMotifCommandeExceptionnelle("");
      return;
    }

    const { error } = await supabase.from("fournitures").update({
      commande_passee: !statutActuel,
      date_commande: !statutActuel ? new Date().toISOString() : null,
      ...(statutActuel ? {
        date_reception: null,
        lieu_reception: null,
        reference_commande_fournisseur: null,
        reception_a_definir: false,
        commande_sans_validation_client: false,
        justification_commande_sans_validation: null,
        date_commande_sans_validation: null
      } : {})
    }).eq("id", idFourniture);

    if (error) {
      alert("Erreur lors de la mise à jour de l'article : " + error.message);
      return;
    }
    setArticlesSelectionnes((precedents) => precedents.filter((articleId) => articleId !== idFourniture));
    await fetchChantierEtFournitures();
  }

  async function confirmerCommandeSansValidation(e: React.FormEvent) {
    e.preventDefault();
    if (!articleCommandeExceptionnelle || enregistrementExceptionEnCours) return;
    const motif = motifCommandeExceptionnelle.trim();
    if (!motif) {
      alert("Indique la raison de la commande sans validation du client.");
      return;
    }

    setEnregistrementExceptionEnCours(true);
    const date = new Date().toISOString();
    try {
      // En édition, on corrige uniquement le motif, jamais la date de commande
      // ni l'indicateur de validation du client.
      const miseAJour = editionMotifException ? {
        justification_commande_sans_validation: motif
      } : {
        commande_passee: true,
        date_commande: date,
        commande_sans_validation_client: true,
        justification_commande_sans_validation: motif,
        date_commande_sans_validation: date
        // Ne jamais écrire « est_valide: true » : seul le client peut valider.
      };
      let requete = supabase.from("fournitures")
        .update(miseAJour).eq("id", articleCommandeExceptionnelle);
      if (editionMotifException) {
        requete = requete.eq("commande_sans_validation_client", true);
      } else if (fournitures.find((article) => article.id === articleCommandeExceptionnelle)?.refuse) {
        // Un refus enregistré par le client est conservé comme tel.
        requete = requete.eq("refuse", true);
      } else {
        requete = requete.eq("est_valide", false);
      }
      const { data, error } = await requete.select("id");
      if (error) throw error;
      if (!data || data.length !== 1) {
        throw new Error("Cet article a changé depuis l'ouverture de la fenêtre. Actualise la liste.");
      }

      if (!editionMotifException) await actualiserStatutApresCommandeExceptionnelle();
      setArticleCommandeExceptionnelle(null);
      setEditionMotifException(false);
      setMotifCommandeExceptionnelle("");
      await fetchChantierEtFournitures();
    } catch (erreur: any) {
      alert("Impossible d'enregistrer cette commande : " + (erreur?.message || "Erreur inconnue"));
    } finally {
      setEnregistrementExceptionEnCours(false);
    }
  }

  async function marquerCommandePassee() {
    if (fournitures.some((article) => (!article.refuse || article.commande_sans_validation_client) && !article.commande_passee)) {
      alert("Impossible de clôturer : certaines fournitures ne sont pas encore commandées.");
      return;
    }
    const currentDate = new Date().toISOString();
    const historiqueActuel = chantier.historique_commandes || [];
    const nouvelHistorique = [...historiqueActuel, currentDate];

    const { error } = await supabase.from("chantiers").update({ 
      statut: "commande_passee",
      historique_commandes: nouvelHistorique
    }).eq("id", id);
    
    if (!error) { 
      fetchChantierEtFournitures(); 
      alert("Dossier clôturé. Le harcèlement par email est arrêté !"); 
    } else {
      alert("Erreur lors de la clôture : " + error.message);
    }
  }

  const toggleSelection = (idFourniture: string) => {
    setArticlesSelectionnes(prev => 
      prev.includes(idFourniture) 
        ? prev.filter(id => id !== idFourniture) 
        : [...prev, idFourniture]
    );
  };

  async function enregistrerInfosReception() {
    if (articlesSelectionnes.length === 0) return;

    const { error } = await supabase
      .from("fournitures")
      .update({
        date_reception: dateReceptionBulk || null,
        reception_a_definir: receptionADefinirBulk,
        lieu_reception: lieuReceptionBulk || null,
        reference_commande_fournisseur: refCommandeBulk || null
      })
      .in("id", articlesSelectionnes);

    if (!error) {
      setArticlesSelectionnes([]);
      setDateReceptionBulk("");
      setLieuReceptionBulk("");
      setRefCommandeBulk("");
      setReceptionADefinirBulk(false);
      fetchChantierEtFournitures();
      alert("Informations logistiques enregistrées avec succès !");
    } else {
      alert("Erreur lors de l'enregistrement : " + error.message);
    }
  }

  async function enregistrerConsignesConducteur() {
    if (!id || sauvegardeConsignesEnCours) return;
    setSauvegardeConsignesEnCours(true);
    try {
      // Recuperer les memos les plus recents pour ne pas ecraser les autres memos.
      const { data, error: erreurLecture } = await supabase
        .from("chantiers")
        .select("historique_memos")
        .eq("id", id)
        .single();
      if (erreurLecture) throw erreurLecture;

      const memos: any[] = Array.isArray(data?.historique_memos) ? data.historique_memos : [];
      const autresMemos = memos.filter((memo) => memo.id !== ID_CONSIGNES_CONDUCTEUR);
      const texte = consignesConducteur.trim();
      const memosMisAJour = texte
        ? [...autresMemos, {
            id: ID_CONSIGNES_CONDUCTEUR,
            texte,
            date: new Date().toISOString(),
            type: "consignes_conducteur"
          }]
        : autresMemos;

      const { error: erreurSauvegarde } = await supabase
        .from("chantiers")
        .update({ historique_memos: memosMisAJour })
        .eq("id", id);
      if (erreurSauvegarde) throw erreurSauvegarde;

      setConsignesConducteur(texte);
      setConsignesEnregistrees(texte);
      setChantier((precedent: any) => precedent ? { ...precedent, historique_memos: memosMisAJour } : precedent);
      alert("Consignes du conducteur de travaux enregistrees.");
    } catch (erreur: any) {
      alert("Impossible d'enregistrer les consignes : " + (erreur?.message || "Erreur inconnue"));
    } finally {
      setSauvegardeConsignesEnCours(false);
    }
  }

  const formaterDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  const formaterDateCourte = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("fr-FR");
  };

  // Nettoyer les caracteres interdits dans le XML du fichier Excel (xlsx).
  // Conserve les accents, sauts de ligne et emojis valides.
  const nettoyerValeurExcel = (valeur: unknown): string => {
    if (valeur === null || valeur === undefined) return "";

    return Array.from(String(valeur))
      .filter((caractere) => {
        const point = caractere.codePointAt(0)!;
        return (
          point === 0x09 ||
          point === 0x0a ||
          point === 0x0d ||
          (point >= 0x20 && point <= 0xd7ff) ||
          (point >= 0xe000 && point <= 0xfffd) ||
          (point >= 0x10000 && point <= 0x10ffff)
        );
      })
      .join("");
  };

  const exporterVersExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Fournitures');

    worksheet.columns = [
      { header: 'Fournisseur', key: 'fournisseur', width: 20 },
      { header: 'Article', key: 'article', width: 40 },
      { header: 'Référence', key: 'reference', width: 20 },
      { header: 'Quantité', key: 'quantite', width: 15 },
      { header: 'Question posée', key: 'question', width: 35 },
      { header: 'Réponse Client', key: 'reponse', width: 35 },
      { header: 'Lien', key: 'lien', width: 15 },
      { header: 'Statut Valid.', key: 'statut', width: 15 },
      { header: 'Date Validation', key: 'date_val', width: 20 },
      { header: 'Commandé', key: 'commande', width: 15 },
      { header: 'Date Réception', key: 'date_reception', width: 20 },
      { header: 'Lieu de Retrait', key: 'lieu', width: 25 },
      { header: 'Réf. Cde Frs', key: 'ref_fournisseur', width: 20 },
      { header: 'Mode de validation', key: 'mode_validation', width: 30 },
      { header: 'Motif commande sans validation client', key: 'motif_exception', width: 55 },
      { header: 'Date commande sans validation', key: 'date_exception', width: 26 }
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    worksheet.getRow(1).height = 30;

    // La date de validation d'un article validé reste visible même si une
    // modification ultérieure a remis temporairement le chantier en brouillon.
    const dateValGlobal = chantier.date_validation ? formaterDate(chantier.date_validation) : "";

    fournitures.forEach((f) => {
      // Chaque champ venant d'un fournisseur ou d'un client est nettoye
      // pour empecher les caracteres interdits de corrompre le fichier Excel.
      const row = worksheet.addRow({
        fournisseur: nettoyerValeurExcel(f.fournisseur),
        article: nettoyerValeurExcel(f.designation),
        reference: nettoyerValeurExcel(f.reference),
        quantite: nettoyerValeurExcel(f.quantite),
        question: nettoyerValeurExcel(f.question_artisan),
        reponse: nettoyerValeurExcel(f.reponse_client),
        lien: nettoyerValeurExcel(f.lien),
        statut: f.commande_sans_validation_client ? (f.refuse ? "REFUSÉ / NON VALIDÉ PAR LE CLIENT POUR COMMANDE" : "NON VALIDÉ PAR LE CLIENT") :
          f.refuse ? "Refusé par le client" : f.est_valide ? "Validé par le client" : "En attente de validation",
        date_val: f.est_valide && !f.commande_sans_validation_client ? dateValGlobal : "",
        commande: f.commande_passee ? "Oui" : "Non",
        date_reception: f.reception_a_definir ? "À définir" : (f.date_reception ? formaterDateCourte(f.date_reception) : ""),
        lieu: nettoyerValeurExcel(f.lieu_reception),
        ref_fournisseur: nettoyerValeurExcel(f.reference_commande_fournisseur),
        mode_validation: f.commande_sans_validation_client ? "Commande par l'entreprise, SANS accord client dans l'application" :
          f.est_valide ? "Validation du client" : "Non validé",
        motif_exception: f.commande_sans_validation_client ? nettoyerValeurExcel(f.justification_commande_sans_validation) : "",
        date_exception: f.commande_sans_validation_client && f.date_commande_sans_validation
          ? formaterDate(f.date_commande_sans_validation) : ""
      });

      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        if (typeof cell.value === "string" && cell.value.includes("NON VALIDÉ PAR LE CLIENT")) {
          cell.font = { bold: true, color: { argb: "FF9A3412" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } };
        }
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Fournitures_${(chantier.nom_client || "Chantier").replace(/\s+/g, '_')}.xlsx`;
    link.click();
  };

  // Convertir une photo distante en JPEG pour l'inserer dans un PDF.
  // En cas d'URL inaccessible, la fiche reste telechargeable sans cette photo.
  const photoVersJPEG = async (url: string): Promise<{ data: string; largeur: number; hauteur: number } | null> => {
    let urlLocale: string | null = null;
    try {
      const reponse = await fetch(url);
      if (!reponse.ok) return null;
      const fichier = await reponse.blob();
      urlLocale = URL.createObjectURL(fichier);
      const image = new Image();
      image.src = urlLocale;
      await image.decode();

      // Limiter le poids du PDF et gerer egalement les formats PNG, WebP, etc.
      const facteur = Math.min(1, 650 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * facteur));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * facteur));
      const contexte = canvas.getContext("2d");
      if (!contexte) return null;
      contexte.fillStyle = "white";
      contexte.fillRect(0, 0, canvas.width, canvas.height);
      contexte.drawImage(image, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL("image/jpeg", 0.78), largeur: canvas.width, hauteur: canvas.height };
    } catch {
      return null;
    } finally {
      if (urlLocale) URL.revokeObjectURL(urlLocale);
    }
  };

  const exporterFicheChantierPDF = async () => {
    if (!chantier || generationFicheEnCours) return;
    setGenerationFicheEnCours(true);
    try {
      // A4 paysage pour conserver les sept colonnes demandees.
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const largeurPage = doc.internal.pageSize.getWidth();
      const hauteurPage = doc.internal.pageSize.getHeight();
      const marge = 10;
      const colonnes = [
        "Article / photo",
        "Quantité",
        "Date de réception",
        "Fournisseur / lieu de retrait",
        "Référence",
        "Question posée",
        "Réponse client"
      ];

      // Inclure toutes les lignes, en signalant les fournitures refusees.
      const lignes = fournitures.map((article) => [
        [nettoyerValeurExcel(article.designation || "Article sans nom"),
         article.refuse ? "REFUSÉ PAR LE CLIENT" : "",
         article.commande_sans_validation_client
           ? `NON VALIDÉ PAR LE CLIENT - Commandé par l'entreprise. Motif : ${nettoyerValeurExcel(article.justification_commande_sans_validation || "Non renseigné")}`
           : ""].filter(Boolean).join("\n"),
        nettoyerValeurExcel(article.quantite),
        article.reception_a_definir
          ? "À définir"
          : article.date_reception
            ? formaterDateCourte(article.date_reception)
            : "Non renseignée",
        [article.fournisseur ? `Fournisseur : ${nettoyerValeurExcel(article.fournisseur)}` : "",
         article.lieu_reception ? `Retrait : ${nettoyerValeurExcel(article.lieu_reception)}` : ""].filter(Boolean).join("\n") || "-",
        nettoyerValeurExcel(article.reference) || "-",
        nettoyerValeurExcel(article.question_artisan) || "-",
        nettoyerValeurExcel(article.reponse_client) || "-"
      ]);

      // Charger toutes les photos avant de dessiner le tableau.
      const photos = await Promise.all(fournitures.map((article) =>
        article.photo_url ? photoVersJPEG(article.photo_url) : Promise.resolve(null)
      ));
      const photosIndisponibles = fournitures.filter((article, index) => article.photo_url && !photos[index]).length;

      doc.setTextColor(25, 38, 59);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("FICHE DE FOURNITURES - CONDUCTEUR DE TRAVAUX", marge, 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Chantier : ${nettoyerValeurExcel(chantier.nom_client) || "Non renseigné"}`, marge, 22);
      if (chantier.adresse_client) {
        const adresse = doc.splitTextToSize(`Adresse : ${nettoyerValeurExcel(chantier.adresse_client)}`, largeurPage - 85);
        doc.text(adresse.slice(0, 2), marge, 27);
      }
      doc.setFontSize(9);
      doc.text(`Editee le ${new Date().toLocaleDateString("fr-FR")}`, largeurPage - marge, 22, { align: "right" });

      autoTable(doc, {
        head: [colonnes],
        body: lignes.length ? lignes : [["Aucune fourniture", "", "", "", "", "", ""]],
        startY: 37,
        margin: { top: 16, right: marge, bottom: 17, left: marge },
        theme: "grid",
        tableWidth: largeurPage - 2 * marge,
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2.1,
          overflow: "linebreak",
          valign: "top",
          lineWidth: 0.16,
          lineColor: [213, 221, 232],
          textColor: [31, 41, 55]
        },
        headStyles: {
          fillColor: [32, 70, 115],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
          valign: "middle"
        },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        columnStyles: {
          0: { cellWidth: 63 },
          1: { cellWidth: 13, halign: "center" },
          2: { cellWidth: 26 },
          3: { cellWidth: 46 },
          4: { cellWidth: 26 },
          5: { cellWidth: 51 },
          6: { cellWidth: 52 }
        },
        didParseCell: (donnees) => {
          if (donnees.section === "body" && donnees.column.index === 0 && photos[donnees.row.index]) {
            // Garder une zone libre sous le texte pour l'image (18 mm).
            const texte = String(lignes[donnees.row.index]?.[0] || "");
            const nbLignes = doc.splitTextToSize(texte, 58).length;
            donnees.cell.styles.minCellHeight = Math.max(27, nbLignes * 3.3 + 23);
          }
        },
        didDrawCell: (donnees) => {
          if (donnees.section !== "body" || donnees.column.index !== 0) return;
          const photo = photos[donnees.row.index];
          if (!photo) return;
          try {
            // Photo sous la designation, sans deformation de ses proportions.
            const facteurPhoto = Math.min(18 / photo.largeur, 18 / photo.hauteur);
            const largeurPhoto = photo.largeur * facteurPhoto;
            const hauteurPhoto = photo.hauteur * facteurPhoto;
            doc.addImage(
              photo.data, "JPEG",
              donnees.cell.x + 2, donnees.cell.y + donnees.cell.height - 20,
              largeurPhoto, hauteurPhoto
            );
          } catch {
            // Une photo non compatible ne doit pas interrompre tout l'export.
          }
        }
      });

      // Les deux encadres figurent SOUS le tableau, y compris si plusieurs pages.
      const ajouterEncadre = (titre: string, texte: string, couleur: [number, number, number]) => {
        const tableau = (doc as any).lastAutoTable;
        let debutY = (tableau?.finalY ?? 37) + 7;
        if (debutY > hauteurPage - 30) {
          doc.addPage();
          debutY = 18;
        }
        autoTable(doc, {
          head: [[titre]],
          body: [[texte.trim() || "Aucune remarque."]],
          startY: debutY,
          margin: { top: 16, left: marge, right: marge, bottom: 17 },
          tableWidth: largeurPage - 2 * marge,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4, overflow: "linebreak", lineColor: [213, 221, 232] },
          headStyles: { fillColor: couleur, fontStyle: "bold", textColor: [255, 255, 255] },
          bodyStyles: { fillColor: [248, 250, 252], textColor: [31, 41, 55] }
        });
      };

      ajouterEncadre("REMARQUES DU CLIENT", nettoyerValeurExcel(chantier.commentaire_client) || "Aucune remarque du client.", [39, 103, 164]);
      ajouterEncadre("CONSIGNES POUR LE CONDUCTEUR DE TRAVAUX", nettoyerValeurExcel(consignesConducteur) || "Aucune consigne particulière.", [40, 97, 76]);

      const totalPages = doc.getNumberOfPages();
      for (let numero = 1; numero <= totalPages; numero++) {
        doc.setPage(numero);
        doc.setDrawColor(218, 226, 235);
        doc.line(marge, hauteurPage - 11, largeurPage - marge, hauteurPage - 11);
        doc.setFontSize(8);
        doc.setTextColor(110, 122, 136);
        doc.text(`Fiche de fournitures - ${nettoyerValeurExcel(chantier.nom_client) || "Chantier"}`, marge, hauteurPage - 7);
        doc.text(`Page ${numero} / ${totalPages}`, largeurPage - marge, hauteurPage - 7, { align: "right" });
      }

      const nomFichier = (chantier.nom_client || "Chantier").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
      doc.save(`Fiche_Fournitures_Chantier_${nomFichier}.pdf`);
      if (photosIndisponibles > 0) {
        alert(`${photosIndisponibles} photo(s) n'ont pas pu etre chargees. Le PDF a ete genere sans elles.`);
      }
    } catch (erreur: any) {
      alert("Erreur pendant la generation du PDF : " + (erreur?.message || "Erreur inconnue"));
    } finally {
      setGenerationFicheEnCours(false);
    }
  };

  const telechargerPreuvePDF = () => {
    const aDesCommandesExceptionnelles = fournitures.some((article) => article.commande_sans_validation_client);
    const aDesValidationsClient = Boolean(chantier.date_validation) ||
      (Array.isArray(chantier.historique_validations) && chantier.historique_validations.length > 0);
    if (!aDesValidationsClient && !aDesCommandesExceptionnelles) {
      alert("Aucune validation client ni commande exceptionnelle enregistrée pour ce chantier.");
      return;
    }

    const doc = new jsPDF();
    const marge = 14;
    const largeurPage = doc.internal.pageSize.getWidth();
    const hauteurPage = doc.internal.pageSize.getHeight();

    // Reconstituer l'historique sans doublonner la dernière date, qui est également
    // conservée dans date_validation. Les deux champs existent déjà dans Supabase.
    const datesEnregistrees = new Set<number>();
    const ajouterDate = (valeur: unknown) => {
      if (typeof valeur !== "string" || !valeur.trim()) return;
      const horodatage = new Date(valeur).getTime();
      if (Number.isFinite(horodatage)) datesEnregistrees.add(horodatage);
    };

    if (Array.isArray(chantier.historique_validations)) {
      chantier.historique_validations.forEach(ajouterDate);
    }
    ajouterDate(chantier.date_validation);

    const datesValidations = Array.from(datesEnregistrees)
      .sort((premiere, suivante) => premiere - suivante)
      .map((horodatage) => new Date(horodatage));

    // Fuseau horaire français, indépendamment des réglages de l'ordinateur utilisé.
    const formaterHorodatage = (date: Date) => date.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Preuve de validation et suivi des commandes", marge, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Chantier / Client : ${chantier.nom_client || "Non renseigné"}`, marge, 29);
    doc.text(
      `Dernière validation du client : ${datesValidations.length ? formaterHorodatage(datesValidations[datesValidations.length - 1]) : "Aucune validation enregistrée"}`,
      marge, 36
    );
    doc.setFontSize(9);
    doc.text("Les commandes signalées SANS validation du client ne constituent pas un accord client.", marge, 42);

    // Historique complet, y compris après ajout ou modification de fournitures.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("HISTORIQUE DES VALIDATIONS", marge, 51);

    autoTable(doc, {
      head: [["N°", "Étape", "Date et heure de validation"]],
      body: datesValidations.length
        ? datesValidations.map((date, index) => [
            String(index + 1),
            index === 0 ? "Validation initiale" : `Validation complémentaire n° ${index + 1}`,
            formaterHorodatage(date)
          ])
        : [["-", "Historique indisponible", "Aucune date enregistrée"]],
      startY: 55,
      margin: { left: marge, right: marge, top: 18, bottom: 18 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [45, 75, 110], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: {
        0: { cellWidth: 17, halign: "center" },
        1: { cellWidth: 85 },
        2: { cellWidth: 80 }
      }
    });

    // Le tableau des fournitures suit l'historique, même si celui-ci prend
    // plusieurs pages. Le PDF correspond à l'état ACTUEL du chantier.
    const finHistorique = (doc as any).lastAutoTable?.finalY ?? 55;
    let titreFournituresY = finHistorique + 12;
    if (titreFournituresY > hauteurPage - 36) {
      doc.addPage();
      titreFournituresY = 22;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("LISTE ACTUELLE - VALIDATIONS CLIENT ET COMMANDES EXCEPTIONNELLES", marge, titreFournituresY);

    const colonnes = ["Article", "Qté", "Fournisseur", "Référence", "Réponse client", "Statut / justification"];
    const lignes = fournitures
      .filter((item) => item.commande_sans_validation_client || (item.est_valide && !item.refuse))
      .map((item) => [
        nettoyerValeurExcel(item.designation) || "-",
        nettoyerValeurExcel(item.quantite) || "-",
        nettoyerValeurExcel(item.fournisseur) || "-",
        nettoyerValeurExcel(item.reference) || "-",
        nettoyerValeurExcel(item.reponse_client) || "-",
        item.commande_sans_validation_client
          ? `${item.refuse ? "REFUSÉ PAR LE CLIENT - " : ""}NON VALIDÉ PAR LE CLIENT pour cette commande. Commandé par l'entreprise le ${item.date_commande_sans_validation ? formaterHorodatage(new Date(item.date_commande_sans_validation)) : "date inconnue"}. Motif : ${nettoyerValeurExcel(item.justification_commande_sans_validation) || "Non renseigné"}`
          : "Validé par le client"
      ]);

    autoTable(doc, {
      head: [colonnes],
      body: lignes.length ? lignes : [["Aucune fourniture avec validation ou commande", "", "", "", "", ""]],
      startY: titreFournituresY + 4,
      margin: { left: marge, right: marge, top: 18, bottom: 18 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.3, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: {
        0: { cellWidth: 36 }, 1: { cellWidth: 11 }, 2: { cellWidth: 24 },
        3: { cellWidth: 20 }, 4: { cellWidth: 30 }, 5: { cellWidth: 61 }
      },
      didParseCell: (cell) => {
        if (cell.section === "body" && cell.column.index === 5 &&
            lignes[cell.row.index]?.[5]?.includes("NON VALIDÉ PAR LE CLIENT")) {
          cell.cell.styles.textColor = [154, 52, 18];
          cell.cell.styles.fillColor = [255, 237, 213];
          cell.cell.styles.fontStyle = "bold";
        }
      }
    });

    // Pied de page numéroté pour les historiques et listes sur plusieurs pages.
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      doc.setDrawColor(220, 225, 231);
      doc.line(marge, hauteurPage - 12, largeurPage - marge, hauteurPage - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 110, 120);
      doc.text(`Preuve de validation - ${chantier.nom_client || "Chantier"}`, marge, hauteurPage - 8);
      doc.text(`Page ${page} / ${totalPages}`, largeurPage - marge, hauteurPage - 8, { align: "right" });
    }

    const nomFichier = (chantier.nom_client || "Chantier")
      .replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
    doc.save(`Preuve_Validation_${nomFichier}.pdf`);
  };

  if (!estAuthentifie) {
    return <div className="p-20 text-center font-bold text-xl text-gray-600">Vérification de sécurité en cours...</div>;
  }

  if (!chantier) return <div className="p-8 font-bold">Chargement...</div>;
  const lienValidation = typeof window !== "undefined" ? `${window.location.origin}/validation/${chantier.token_validation}` : "";

  const articleException = fournitures.find((article) => article.id === articleCommandeExceptionnelle);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {articleException && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="titre-commande-exceptionnelle">
          <form onSubmit={confirmerCommandeSansValidation} className="bg-white w-full max-w-xl rounded-lg shadow-xl p-6 space-y-4">
            <h2 id="titre-commande-exceptionnelle" className="text-xl font-bold text-amber-900">{editionMotifException ? "Modifier le motif de la commande" : "Commande sans validation du client"}</h2>
            <p className="text-sm text-gray-800">Article : <strong>{articleException.designation}</strong></p>
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 p-3 rounded">
              {articleException.refuse ? "Cet article a été REFUSÉ par le client dans l'application. La commande restera identifiée comme exceptionnelle, malgré ce refus." : "Cet article n'a pas été validé par le client dans l'application."} La commande sera signalée comme <strong>NON VALIDÉE PAR LE CLIENT</strong> sur son lien et dans les exports Excel et PDF.
              L'indication du motif ne transforme pas la commande en validation du client.
            </p>
            <div>
              <label htmlFor="motif-commande-exceptionnelle" className="block text-sm font-semibold mb-2">Motif / explication (obligatoire)</label>
              <textarea
                id="motif-commande-exceptionnelle"
                className="w-full min-h-28 p-3 border rounded focus:ring-2 focus:ring-amber-500"
                value={motifCommandeExceptionnelle}
                onChange={(e) => setMotifCommandeExceptionnelle(e.target.value)}
                placeholder="Ex. : Accord communiqué par téléphone le 10/10/2026 ou par e-mail le 24/10/2026. Préciser la personne et les circonstances."
                rows={4}
                maxLength={2000}
                required
              />
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => { setArticleCommandeExceptionnelle(null); setEditionMotifException(false); setMotifCommandeExceptionnelle(""); }} disabled={enregistrementExceptionEnCours} className="px-4 py-2 bg-gray-100 rounded border">Annuler</button>
              <button type="submit" disabled={enregistrementExceptionEnCours || !motifCommandeExceptionnelle.trim()} className="px-4 py-2 bg-amber-700 text-white rounded font-bold disabled:opacity-50">
                {enregistrementExceptionEnCours ? "Enregistrement..." : editionMotifException ? "Enregistrer le motif corrigé" : "Confirmer la commande sans validation client"}
              </button>
            </div>
          </form>
        </div>
      )}
      <Link href="/" className="text-gray-500 hover:text-black mb-6 inline-block font-bold">&larr; Retour</Link>
      
      <div className="flex justify-between items-start mb-8 pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold">{chantier.nom_client}</h1>
          <p className="text-gray-600 mt-1">STATUT : <strong className="uppercase">{chantier.statut === 'brouillon' ? 'EN COURS DE MODIFICATION' : chantier.statut}</strong></p>
          {fournitures.some((article) => article.commande_sans_validation_client) && (
            <p className="text-amber-900 font-semibold text-sm mt-2">⚠️ Ce chantier contient des commandes NON VALIDÉES PAR LE CLIENT (motifs détaillés ci-dessous).</p>
          )}
        </div>
        <div className="text-right flex flex-col items-end gap-2">
           <div className="flex gap-2 flex-wrap justify-end">
             <button onClick={exporterVersExcel} className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700">📊 Exporter Excel</button>
             <button onClick={exporterFicheChantierPDF} disabled={generationFicheEnCours} className="bg-indigo-700 text-white px-4 py-2 rounded font-bold hover:bg-indigo-800 disabled:opacity-60">{generationFicheEnCours ? "Preparation du PDF..." : "📄 Fiche chantier PDF"}</button>
             {(Boolean(chantier.date_validation) || (Array.isArray(chantier.historique_validations) && chantier.historique_validations.length > 0) || fournitures.some((f) => f.commande_sans_validation_client)) && (
               <button onClick={telechargerPreuvePDF} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">📄 Preuve PDF</button>
             )}
           </div>
           
           {(chantier.statut === "valide" || chantier.statut === "commande_passee") && (chantier.historique_validations?.length > 0 || chantier.date_validation) && (
            <div className="flex flex-col gap-1 mt-2 items-end">
              {chantier.historique_validations && chantier.historique_validations.length > 0 ? (
                chantier.historique_validations.map((dateIso: string, index: number) => (
                  <div key={index} className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded border">
                    {index === 0 ? "🔒 Validé le :" : "📝 Modification validée le :"} <strong>{formaterDate(dateIso)}</strong>
                  </div>
                ))
              ) : chantier.date_validation ? (
                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded border">
                  🔒 Validé le : <strong>{formaterDate(chantier.date_validation)}</strong>
                </div>
              ) : null}
            </div>
          )}

          {chantier.historique_commandes && chantier.historique_commandes.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 items-end">
              {chantier.historique_commandes.map((dateIso: string, index: number) => (
                <div key={`cmd-${index}`} className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                  📦 Passé en commande le : <strong>{formaterDate(dateIso)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Consignes internes propres a la fiche PDF du conducteur de travaux */}
      <section className="mb-8 p-5 rounded-lg border border-indigo-200 bg-indigo-50">
        <h2 className="font-bold text-indigo-900 text-lg mb-1">📋 Consignes pour la fiche chantier PDF</h2>
        <p className="text-sm text-indigo-800 mb-3">
          Indique ici les informations utiles au conducteur de travaux : livraison, stockage,
          preparation, points de vigilance, etc. Ces consignes seront reprises sous le tableau du PDF.
        </p>
        <textarea
          className="w-full min-h-28 border border-indigo-300 rounded-md p-3 bg-white text-gray-900"
          rows={4}
          value={consignesConducteur}
          onChange={(e) => setConsignesConducteur(e.target.value)}
          placeholder="Ex. : Receptionner le carrelage avant le debut des travaux et verifier les references sur les colis."
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={enregistrerConsignesConducteur}
            disabled={sauvegardeConsignesEnCours || consignesConducteur.trim() === consignesEnregistrees}
            className="rounded-md bg-indigo-700 text-white font-semibold px-4 py-2 hover:bg-indigo-800 disabled:opacity-50"
          >
            {sauvegardeConsignesEnCours ? "Enregistrement..." : "Enregistrer les consignes"}
          </button>
          <span className="text-sm text-indigo-800">
            {consignesConducteur.trim() !== consignesEnregistrees
              ? "Modifications non enregistrees (elles seront tout de meme dans le PDF genere maintenant)."
              : "Consignes enregistrees pour ce chantier."}
          </span>
        </div>
      </section>

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
          {chantier.commentaire_client && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
              <h3 className="font-bold text-blue-900 mb-1">💬 Remarque du client :</h3>
              <p className="text-sm text-blue-800 italic whitespace-pre-wrap">"{chantier.commentaire_client}"</p>
            </div>
          )}

          {articlesSelectionnes.length > 0 && (
            <div className="bg-green-100 p-5 rounded-lg border border-green-400 mb-6 shadow-md transition-all">
              <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                📦 Infos de logistique pour {articlesSelectionnes.length} article(s) sélectionné(s)
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-bold text-green-800 mb-1">Date de réception</label>
                  <input 
                    type="date" 
                    className="w-full border border-green-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500 text-sm disabled:opacity-50 disabled:bg-gray-100" 
                    value={dateReceptionBulk} 
                    onChange={e => setDateReceptionBulk(e.target.value)} 
                    disabled={receptionADefinirBulk}
                  />
                  <label className="flex items-center gap-2 mt-2 text-sm text-green-900 cursor-pointer font-medium">
                    <input 
                      type="checkbox" 
                      className="accent-green-600 w-4 h-4"
                      checked={receptionADefinirBulk}
                      onChange={(e) => {
                        setReceptionADefinirBulk(e.target.checked);
                        if (e.target.checked) setDateReceptionBulk(""); 
                      }}
                    />
                    À définir
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-bold text-green-800 mb-1">Lieu de retrait</label>
                  <input type="text" placeholder="Ex: Leroy Merlin" className="w-full border border-green-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" value={lieuReceptionBulk} onChange={e => setLieuReceptionBulk(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-green-800 mb-1">Réf. Fournisseur</label>
                  <input type="text" placeholder="Ex: LR 1561651" className="w-full border border-green-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" value={refCommandeBulk} onChange={e => setRefCommandeBulk(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={enregistrerInfosReception} className="flex-1 bg-green-700 text-white px-4 py-2 rounded font-bold hover:bg-green-800">
                  Enregistrer pour les articles cochés
                </button>
                <button onClick={() => setArticlesSelectionnes([])} className="bg-white text-green-900 border border-green-400 px-4 py-2 rounded font-bold hover:bg-green-50">
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
            <h2 className="text-xl font-semibold mb-4">Liste actuelle</h2>
            {fournitures.length === 0 ? <p className="text-gray-500 italic">Vide.</p> : (
              <ul className="space-y-4">
                {fournitures.map((item) => (
                  <li key={item.id} className={`flex flex-col p-4 border rounded shadow-sm ${item.refuse ? "bg-red-50 border-red-200" : "bg-white"} ${editingId === item.id ? "border-yellow-400 ring-2 ring-yellow-200" : ""} ${articlesSelectionnes.includes(item.id) ? "border-green-400 ring-2 ring-green-100" : ""}`}>
                    <div className="flex gap-4 items-start">
                      
                      {item.commande_passee && (
                        <input 
                          type="checkbox" 
                          className="mt-2 w-5 h-5 cursor-pointer accent-green-600 flex-shrink-0"
                          checked={articlesSelectionnes.includes(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          title="Sélectionner pour grouper la réception"
                        />
                      )}

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

                        {item.commande_sans_validation_client && (
                          <div className="mt-3 bg-amber-50 border border-amber-300 rounded p-3 text-sm">
                            <p className="font-bold text-amber-950">⚠️ Commandé SANS validation du client</p>
                            <p className="text-amber-900 mt-1 whitespace-pre-wrap">Motif : {item.justification_commande_sans_validation || "Non renseigné"}</p>
                            {item.date_commande_sans_validation && <p className="text-xs text-amber-800 mt-1">Enregistré le {formaterDate(item.date_commande_sans_validation)}</p>}
                            <button type="button" onClick={() => {
                              setArticleCommandeExceptionnelle(item.id);
                              setEditionMotifException(true);
                              setMotifCommandeExceptionnelle(item.justification_commande_sans_validation || "");
                            }} className="text-sm underline text-amber-900 mt-2">Corriger le motif</button>
                          </div>
                        )}
                        {item.refuse && <span className="text-xs font-bold text-red-600 block mt-2">❌ REFUSÉ</span>}
                        
                        {(item.date_reception || item.reception_a_definir || item.lieu_reception || item.reference_commande_fournisseur) && (
                          <div className="mt-3 bg-green-50 p-3 rounded border border-green-200 text-sm">
                             <p className="font-semibold text-green-900 mb-1">📦 Détails de logistique :</p>
                             <ul className="text-green-800 space-y-1">
                               {(item.date_reception || item.reception_a_definir) && (
                                 <li>📅 Date de réception : <strong>{item.reception_a_definir ? "À définir" : formaterDateCourte(item.date_reception)}</strong></li>
                               )}
                               {item.lieu_reception && <li>📍 Lieu de retrait : <strong>{item.lieu_reception}</strong></li>}
                               {item.reference_commande_fournisseur && <li>🏷️ Réf. Commande : <strong>{item.reference_commande_fournisseur}</strong></li>}
                             </ul>
                          </div>
                        )}

                      </div>
                    </div>
                    
                    {(!item.refuse || item.commande_sans_validation_client || !item.commande_passee) && (
                      <div className="mt-4 pt-3 border-t flex justify-between items-center">
                        <div>
                          <span className="text-sm font-medium text-gray-600 block">État de la commande :</span>
                          {item.commande_passee && item.date_commande && (
                            <span className="text-xs text-blue-600 font-bold mt-1 inline-block">Commandé le : {formaterDate(item.date_commande)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => marquerArticleCommande(item.id, item.commande_passee)}
                          className={`px-4 py-1.5 text-sm font-bold rounded transition-colors ${
                            item.commande_passee 
                              ? "bg-blue-600 text-white hover:bg-blue-700" 
                              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                          }`}
                        >
                          {item.commande_passee ? "✅ Commandé" : item.refuse ? "⚠️ Commander malgré le refus" : "⏳ À commander"}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {chantier.statut !== "commande_passee" && fournitures.length > 0 &&
            fournitures.filter((f) => !f.refuse || f.commande_sans_validation_client).length > 0 &&
            fournitures.filter((f) => !f.refuse || f.commande_sans_validation_client).every((f) => f.commande_passee) && (
            <div className="mt-6 p-6 border rounded-lg bg-green-50 border-green-200 text-center">
               <p className="text-sm text-green-800 mb-3">Toutes les fournitures retenues sont marquées « commandées ». Clôturer les commandes n'implique aucune validation du client pour les articles signalés comme exceptions.</p>
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