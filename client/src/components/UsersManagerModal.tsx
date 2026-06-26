/**
 * UsersManagerModal — CRUD de usuários (admin-only).
 */
import { useState } from "react";
import { X, Plus, Trash2, Shield, User as UserIcon, Check, Pencil, Building2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { HOSPITALS, type Hospital } from "@/lib/hospitals";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Seletor de unidades (multi-select por chips). Vazio = sem restrição (vê tudo). */
function HospitalPicker({
  value,
  onChange,
}: {
  value: Hospital[];
  onChange: (next: Hospital[]) => void;
}) {
  function toggle(h: Hospital) {
    onChange(value.includes(h) ? value.filter((x) => x !== h) : [...value, h]);
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {HOSPITALS.map((h) => {
          const active = value.includes(h);
          return (
            <button
              key={h}
              type="button"
              onClick={() => toggle(h)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all ${
                active
                  ? "bg-[#11131F] text-white border-[#11131F]"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {h}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Vazio = acesso a todas as unidades. Admins sempre veem tudo.
      </p>
    </div>
  );
}

export function UsersManagerModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: users = [], refetch } = trpc.admin.users.list.useQuery(undefined, {
    enabled: open,
  });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
    role: "user" as "admin" | "user",
    allowedHospitals: [] as Hospital[],
  });

  // Edição inline de unidades/role de um usuário existente.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ role: "admin" | "user"; allowedHospitals: Hospital[] }>({
    role: "user",
    allowedHospitals: [],
  });

  const createMutation = trpc.admin.users.create.useMutation({
    onSuccess: () => {
      toast.success(`Usuário criado`);
      setForm({ username: "", name: "", password: "", role: "user", allowedHospitals: [] });
      setCreating(false);
      utils.admin.users.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.admin.users.update.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado");
      setEditingId(null);
      utils.admin.users.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Usuário desativado");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) return null;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      username: form.username.trim().toLowerCase(),
      name: form.name.trim(),
      password: form.password,
      role: form.role,
      allowedHospitals: form.role === "admin" ? null : form.allowedHospitals,
    });
  }

  function startEdit(u: { id: number; role: "admin" | "user"; allowedHospitals?: string[] | null }) {
    setEditingId(u.id);
    setEditDraft({
      role: u.role,
      allowedHospitals: (u.allowedHospitals ?? []) as Hospital[],
    });
  }

  function saveEdit(id: number) {
    updateMutation.mutate({
      id,
      role: editDraft.role,
      allowedHospitals: editDraft.role === "admin" ? null : editDraft.allowedHospitals,
    });
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Desativar usuário ${name}?`)) return;
    deleteMutation.mutate({ id });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-blue-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Usuários</h2>
              <p className="text-[11px] text-muted-foreground">Gerencie quem tem acesso ao painel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Form de criação */}
          {creating ? (
            <form onSubmit={handleCreate} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Novo usuário</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoFocus
                  required
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                />
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                />
                <input
                  type="password"
                  placeholder="Senha (≥ 6 chars)"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                />
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                >
                  <option value="user">Usuário (acesso limitado)</option>
                  <option value="admin">Admin (acesso total)</option>
                </select>
              </div>
              {form.role === "user" && (
                <div>
                  <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Unidades permitidas
                  </p>
                  <HospitalPicker
                    value={form.allowedHospitals}
                    onChange={(next) => setForm({ ...form, allowedHospitals: next })}
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="flex-1 h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 h-9 px-3 btn-primary text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" />
                  {createMutation.isPending ? "Criando..." : "Criar usuário"}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar usuário
            </button>
          )}

          {/* Lista */}
          <div className="space-y-1.5">
            {users.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">Nenhum usuário cadastrado.</p>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className={`rounded-xl border border-border ${u.active ? "bg-card" : "bg-muted/30 opacity-60"}`}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-muted text-xs font-bold uppercase text-foreground/60">
                      {(u.name ?? u.username ?? "?").charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.name ?? u.username}
                        </p>
                        {u.role === "admin" && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#DFFF00]/30 text-[#11131F] text-[10px] font-bold uppercase tracking-wider">
                            <Shield className="w-2.5 h-2.5" />
                            Admin
                          </span>
                        )}
                        {!u.active && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {u.username} {u.email ? `· ${u.email}` : ""}
                      </p>
                      {/* Unidades (só para não-admin) */}
                      {u.role !== "admin" && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {u.allowedHospitals && u.allowedHospitals.length > 0 ? (
                            u.allowedHospitals.map((h) => (
                              <span key={h} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-semibold text-foreground/70">
                                {h}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Todas as unidades</span>
                          )}
                        </div>
                      )}
                    </div>
                    {u.active && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                          title="Editar acesso"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.name ?? u.username ?? "?")}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
                          title="Desativar usuário"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Painel de edição inline */}
                  {editingId === u.id && (
                    <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/20">
                      <div>
                        <p className="text-[11px] font-semibold text-foreground mb-1.5">Role</p>
                        <select
                          value={editDraft.role}
                          onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value as "admin" | "user" })}
                          className="px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                        >
                          <option value="user">Usuário (acesso limitado)</option>
                          <option value="admin">Admin (acesso total)</option>
                        </select>
                      </div>
                      {editDraft.role === "user" && (
                        <div>
                          <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> Unidades permitidas
                          </p>
                          <HospitalPicker
                            value={editDraft.allowedHospitals}
                            onChange={(next) => setEditDraft({ ...editDraft, allowedHospitals: next })}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="flex-1 h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(u.id)}
                          disabled={updateMutation.isPending}
                          className="flex-1 h-9 px-3 btn-primary text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {updateMutation.isPending ? "Salvando..." : "Salvar acesso"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
