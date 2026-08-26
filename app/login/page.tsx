"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function PageConnexion() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const gererConnexion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("Erreur de connexion : " + error.message);
      setLoading(false);
    } else {
      // Si la connexion réussit, on redirige vers l'accueil
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md border">
        <h1 className="text-2xl font-bold mb-6 text-center">Accès Artisan</h1>
        <form onSubmit={gererConnexion} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1">E-mail</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full border p-2 rounded"
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Mot de passe</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full border p-2 rounded"
              required 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-black text-white font-bold py-3 rounded hover:bg-gray-800 disabled:bg-gray-400"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}