'use client';

import { useState } from 'react';
import { Download, Upload, Lock, Loader2 } from 'lucide-react';
import { BotConfig } from '@/lib/types';

export function BackupManager({ bots, onUpdate }: { bots: BotConfig[], onUpdate: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'export' | 'import' | null>(null);

  // PBKDF2 to derive key
  const getDerivedKey = async (pwd: string, salt: Uint8Array) => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(pwd), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt as any, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  };

  const handleExport = async () => {
    if (!password) {
      alert("Please enter a password to secure your backup.");
      return;
    }
    setLoading(true);
    try {
      const dataStr = JSON.stringify(bots);
      const enc = new TextEncoder();
      const encodedData = enc.encode(dataStr);

      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const key = await getDerivedKey(password, salt);

      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv }, key, encodedData
      );

      // Create a blob containing Salt + IV + Encrypted Data
      const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encryptedContent), salt.length + iv.length);

      const blob = new Blob([combined], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus_backup_${new Date().toISOString().split('T')[0]}.securebot`;
      a.click();
      URL.revokeObjectURL(url);
      setMode(null);
      setPassword('');
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
    setLoading(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!password) {
      alert("Please enter the password used to encrypt this backup.");
      return;
    }
    
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);

      const salt = data.slice(0, 16);
      const iv = data.slice(16, 28);
      const encryptedData = data.slice(28);

      const key = await getDerivedKey(password, salt);

      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv }, key, encryptedData
      );

      const dec = new TextDecoder();
      const decodedData = dec.decode(decryptedContent);
      const importedBots: BotConfig[] = JSON.parse(decodedData);

      // Send to server
      for (const bot of importedBots) {
        
        // Ensure to create a new one to not clash completely OR we overwrite if ID exists?
        // Let's just create new ones to ensure we don't break existing active ones
        await fetch('/api/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${bot.name} (Restored)`,
            discord_token: bot.discord_token,
            provider: bot.provider,
            model: bot.model,
            api_key: bot.api_key,
            context_size: bot.context_size,
            tts_provider: bot.tts_provider,
            tts_voice: bot.tts_voice,
            tts_api_key: bot.tts_api_key,
            system_prompt: bot.system_prompt
          })
        });
      }

      alert("Backup successfully restored! New instances created.");
      setMode(null);
      setPassword('');
      onUpdate();
    } catch (err: any) {
      alert(`Import failed. Incorrect password or corrupt file.`);
    }
    setLoading(false);
  };

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800/80">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Secure Backup System</h3>
      
      {!mode ? (
        <div className="flex gap-2">
          <button onClick={() => setMode('export')} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-colors">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setMode('import')} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-colors">
            <Upload size={14} /> Restore
          </button>
        </div>
      ) : (
        <div className="space-y-3 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/60">
           <div className="flex justify-between items-center mb-1">
             <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5"><Lock size={12} className="text-amber-500" /> {mode === 'export' ? 'Encrypt Backup' : 'Decrypt Backup'}</span>
             <button onClick={() => setMode(null)} className="text-[10px] text-zinc-500 hover:text-zinc-300">Cancel</button>
           </div>
           
           <input 
             type="password" 
             value={password}
             onChange={e => setPassword(e.target.value)}
             placeholder="Enter strong password..."
             className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors"
           />
           
           {mode === 'export' && (
             <button onClick={handleExport} disabled={loading || !password} className="w-full py-2 bg-zinc-100 disabled:bg-zinc-600 text-zinc-900 disabled:text-zinc-400 rounded-md text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
               {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={14} />} Encrypt & Download
             </button>
           )}

           {mode === 'import' && (
             <div className="relative">
               <input 
                 type="file" 
                 accept=".securebot"
                 onChange={handleImport}
                 disabled={loading || !password}
                 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
               />
               <button disabled={loading || !password} className="w-full py-2 bg-zinc-100 disabled:bg-zinc-600 text-zinc-900 disabled:text-zinc-400 rounded-md text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 pointer-events-none">
                 {loading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={14} />} Select .securebot File
               </button>
             </div>
           )}
        </div>
      )}
    </div>
  );
}
