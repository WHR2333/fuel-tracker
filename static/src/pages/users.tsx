// User management page — admin only. Lists users, allows create / delete / reset password.

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { users as api } from "@/lib/api";
import { EmptyState } from "@/components/empty-state";
import { pushToast } from "@/components/toast-host";
import { isAdmin } from "@/lib/auth";
import { UserPlus, Trash2, KeyRound } from "lucide-react";

interface UserItem {
  id: string;
  username: string;
  is_admin: boolean;
}

export function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = React.useState<UserItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPwd, setNewPwd] = React.useState("");
  const [resetTarget, setResetTarget] = React.useState<UserItem | null>(null);
  const [resetPwd, setResetPwd] = React.useState("");

  React.useEffect(() => {
    if (!isAdmin()) { navigate("/"); return; }
    api.list().then(setUsers).finally(() => setLoading(false));
  }, [navigate]);

  if (!isAdmin()) return null;
  if (loading) return <EmptyState text="加载中…" />;

  const doCreate = async () => {
    if (!newName.trim() || !newPwd.trim()) return;
    try {
      await api.create(newName.trim(), newPwd);
      pushToast(`用户 ${newName.trim()} 已创建`);
      setNewName(""); setNewPwd(""); setShowAdd(false);
      api.list().then(setUsers);
    } catch (e) { pushToast((e as Error).message); }
  };

  const doDelete = async (u: UserItem) => {
    if (!confirm(`确认删除用户 ${u.username}？其所有数据将被删除。`)) return;
    try {
      await api.remove(u.id);
      pushToast("已删除");
      api.list().then(setUsers);
    } catch (e) { pushToast((e as Error).message); }
  };

  const doResetPwd = async () => {
    if (!resetTarget || !resetPwd.trim()) return;
    try {
      await api.setPassword(resetTarget.id, resetPwd);
      pushToast(`${resetTarget.username} 密码已重置`);
      setResetTarget(null); setResetPwd("");
    } catch (e) { pushToast((e as Error).message); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-outline" style={{ width: "auto", padding: "6px 12px", fontSize: 13 }} onClick={() => navigate(-1)}>← 返回</button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>用户管理</h2>
        <button className="btn btn-primary" style={{ width: "auto", padding: "6px 12px", fontSize: 13 }} onClick={() => setShowAdd(true)}>
          <UserPlus size={16} strokeWidth={1} /> 添加
        </button>
      </div>

      {/* Add user form */}
      {showAdd ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>用户名</label>
              <input className="form-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="用户名" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>密码</label>
              <input className="form-input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="初始密码" />
            </div>
            <button className="btn btn-primary" style={{ width: "auto", padding: "8px 16px", whiteSpace: "nowrap" }} onClick={doCreate}>确定</button>
            <button className="btn btn-outline" style={{ width: "auto", padding: "8px 12px" }} onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      ) : null}

      {/* Reset password dialog */}
      {resetTarget ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>重置 {resetTarget.username} 的密码</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>新密码</label>
              <input className="form-input" type="password" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} placeholder="新密码" />
            </div>
            <button className="btn btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={doResetPwd}>确定</button>
            <button className="btn btn-outline" style={{ width: "auto", padding: "8px 12px" }} onClick={() => { setResetTarget(null); setResetPwd(""); }}>取消</button>
          </div>
        </div>
      ) : null}

      {/* User list */}
      <div className="card">
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <span style={{ fontWeight: 600 }}>{u.username}</span>
              {u.is_admin ? <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 8, background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "2px 6px", borderRadius: 4 }}>管理员</span> : null}
            </div>
            {u.is_admin ? null : (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline" style={{ width: "auto", padding: "4px 10px", fontSize: 12 }} onClick={() => { setResetTarget(u); setResetPwd(""); }}>
                  <KeyRound size={14} /> 改密码
                </button>
                <button className="btn btn-outline" style={{ width: "auto", padding: "4px 10px", fontSize: 12, color: "var(--red)" }} onClick={() => doDelete(u)}>
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
