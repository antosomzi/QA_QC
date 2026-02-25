# Authentication Flow - Documentation Finale

## Vue d'ensemble

Système d'authentification avec **page de login locale** et **API externe** (Flask) pour la validation des credentials.

---

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NAVIGATEUR                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Page /login                                              │ │
│  │  - Formulaire email/password                              │ │
│  │  - Submit → POST /api/auth/callback                       │ │
│  │  - window.location.href = "/" après succès                │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Cookie: sessionId=abc123 (HTTP-only, Secure)             │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ credentials: "include"
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVEUR EXPRESS (Local)                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Middleware: express-session                              │ │
│  │  - Store: PostgreSQL (table "session")                    │ │
│  │  - Charge automatiquement req.session                     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Routes /api/auth/*                                       │ │
│  │  - POST /api/auth/callback → Proxy login Flask            │ │
│  │  - GET  /api/auth/me       → User depuis session          │ │
│  │  - POST /api/auth/logout   → Détruit session              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Session table (PostgreSQL)                               │ │
│  │  - sid: sessionId                                         │ │
│  │  - sess: { userId, email, name, ... }                     │ │
│  │  - expire: timestamp                                      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ❌ PAS de table "users"                                        │
│  ✅ Tout dans la session                                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ UNIQUEMENT au login
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              API EXTERNE (Flask - https://pima.sci.ce.gatech.edu) │
│  - POST /login         → Form-urlencoded + cookie HTTP-only     │
│  - GET  /api/me        → Retourne infos utilisateur             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Fichiers clés

### Backend

| Fichier | Rôle |
|---------|------|
| `server/auth.ts` | Routes d'auth + middleware session |
| `server/routes.ts` | Setup du pool PostgreSQL pour session |
| `shared/schema.ts` | Type `AuthUser` (plus de table users) |

### Frontend

| Fichier | Rôle |
|---------|------|
| `client/src/pages/login.tsx` | Page de login avec formulaire |
| `client/src/lib/auth.ts` | Fonctions API (login, logout, getCurrentUser) |
| `client/src/hooks/use-auth.ts` | Hook React pour l'état d'auth |
| `client/src/components/auth-guard.tsx` | Protège les routes |
| `client/src/components/user-menu.tsx` | Menu utilisateur + logout |
| `client/src/App.tsx` | Routing avec AuthGuard |

### Base de données

| Table | Statut | Rôle |
|-------|--------|------|
| `session` | ✅ Créée automatiquement | Stocke les sessions |
| `users` | ❌ Supprimée | Plus nécessaire |

---

## 🔄 Flux d'authentification

### SCÉNARIO 1 : Login (première connexion)

```
1. User → http://localhost:5001/login
   ↓
2. Affiche page de login avec formulaire
   ↓
3. User entre email/password
   ↓
4. Submit → POST /api/auth/callback
   ↓
5. Serveur appelle Flask: POST https://pima.../login
   Content-Type: application/x-www-form-urlencoded
   Body: email=xxx&password=yyy
   ↓
6. Flask retourne 302 + Set-Cookie: session=abc123
   ↓
7. Serveur extrait le cookie externe
   ↓
8. Serveur appelle Flask: GET https://pima.../api/me
   Cookie: session=abc123
   ↓
9. Flask retourne infos utilisateur
   ↓
10. Serveur stocke infos dans req.session
    ↓
11. Serveur retourne { user: {...} } au client
    ↓
12. Client: window.location.href = "/"
    ↓
13. Navigateur recharge la page avec cookie sessionId
    ↓
14. Middleware express-session charge la session
    ↓
15. User voit l'application ✅
```

### SCÉNARIO 2 : Visites suivantes (déjà connecté)

```
1. User → http://localhost:5001/
   ↓
2. Navigateur envoie Cookie: sessionId=abc123
   ↓
3. Middleware express-session:
   - Lit sessionId
   - SELECT * FROM session WHERE sid = 'abc123'
   - Charge req.session automatiquement
   ↓
4. AuthGuard appelle /api/auth/me
   ↓
5. /api/auth/me lit req.session (DÉJÀ EN MÉMOIRE)
   ↓
6. Retourne { user: {...} } immédiatement
   ↓
7. User voit l'app ✅

AUCUN APPEL API EXTERNE - TOUT EST EN SESSION !
```

### SCÉNARIO 3 : Logout

```
1. User clique sur menu utilisateur (en haut à droite)
   ↓
2. Clique sur "Log out"
   ↓
3. POST /api/auth/logout
   ↓
4. Serveur: req.session.destroy()
   ↓
5. Client: setLocation("/login")
   ↓
6. User voit la page de login ✅
```

---

## 📝 Code des composants principaux

### 1. Route POST /api/auth/callback (`server/auth.ts`)

```typescript
router.post("/callback", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Flask expects form-urlencoded, not JSON
    const params = new URLSearchParams();
    params.append("email", email);
    params.append("password", password);

    // 1. Authenticate via external Flask API
    const loginResponse = await nodeFetch(`${EXTERNAL_API_URL}/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString(),
      redirect: "manual", // Flask does 302 redirects
    });

    // 2. Get external API session cookie
    const setCookieHeader = loginResponse.headers.get("set-cookie");
    
    if (!setCookieHeader) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const externalCookie = setCookieHeader.split(";")[0].trim();

    // 3. Fetch user info from external API
    const meResponse = await nodeFetch(`${EXTERNAL_API_URL}/api/me`, {
      headers: { Cookie: externalCookie },
    });

    const userData = await meResponse.json();

    // 4. Store EVERYTHING in local session (no DB)
    req.session.userId = userData.id;
    req.session.email = userData.email;
    req.session.name = userData.name;
    req.session.organizationId = userData.organization_id;
    req.session.organizationName = userData.organization_name;
    req.session.isAdmin = userData.is_admin || false;
    req.session.isOrgOwner = userData.is_org_owner || false;

    // 5. Save and return
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ message: "Session creation failed" });
      }

      res.json({
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          organizationId: userData.organization_id,
          organizationName: userData.organization_name,
          isAdmin: userData.is_admin,
          isOrgOwner: userData.is_org_owner,
        }
      });
    });

  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ message: "Authentication server error" });
  }
});
```

### 2. Page de Login (`client/src/pages/login.tsx`)

```tsx
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login({ email, password });
      toast({
        title: "Login successful",
        description: "Welcome back!",
      });
      
      // Hard redirect to ensure cookie is written
      window.location.href = "/";
    } catch (error) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
```

### 3. Fonction login (`client/src/lib/auth.ts`)

```typescript
export async function login(credentials: LoginInput): Promise<AuthUser> {
  const response = await fetch("/api/auth/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Login failed");
  }

  const data = await response.json();
  return data.user;
}
```

### 4. Middleware express-session (`server/auth.ts`)

```typescript
export function createSessionMiddleware(pool: Pool) {
  return session({
    store: new PgSessionStore({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,      // ✅ Inaccessible JS
      secure: NODE_ENV === "production",
      sameSite: "lax",     // ✅ Protection CSRF
      maxAge: 24 * 60 * 60 * 1000,  // 24 hours
    },
    name: "sessionId",
    rolling: true,         // ✅ Renouvelle à chaque requête
  });
}
```

### 5. Route GET /api/auth/me (`server/auth.ts`)

```typescript
router.get("/me", (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Lecture DIRECTE depuis la session - PAS DE DB
  res.json({
    user: {
      id: req.session.userId,
      email: req.session.email!,
      name: req.session.name!,
      organizationId: req.session.organizationId!,
      organizationName: req.session.organizationName!,
      isAdmin: req.session.isAdmin!,
      isOrgOwner: req.session.isOrgOwner!,
    }
  });
});
```

### 6. AuthGuard (`client/src/components/auth-guard.tsx`)

```tsx
export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) return <div>Loading...</div>;
  if (!user) return null;

  return <>{children}</>;
}
```

### 7. UserMenu (`client/src/components/user-menu.tsx`)

```tsx
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/login");  // Redirect to login after logout
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost"><User /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## 🔐 Données utilisateur stockées

### Dans la session (table `session`)

```json
{
  "userId": "user_123",
  "email": "arevel3@gatech.edu",
  "name": "Antoine Revel",
  "organizationId": "org_456",
  "organizationName": "Georgia Tech",
  "isAdmin": true,
  "isOrgOwner": false
}
```

### Champs de l'API Flask

L'API externe retourne ces champs via `/api/me` :

```json
{
  "id": "user_123",
  "name": "Antoine Revel",
  "email": "arevel3@gatech.edu",
  "organization_id": "org_456",
  "organization_name": "Georgia Tech",
  "is_admin": true,
  "is_org_owner": false
}
```

---

## 🛠️ Configuration

### Variables d'environnement (`.env`)

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/annotation_app_db"
PORT=5001
SESSION_SECRET="your-secret-key-change-in-production"
API_BASE_URL="https://pima.sci.ce.gatech.edu"
NODE_ENV="development"
```

### Dépendances npm

```bash
# Installées
npm install express-session connect-pg-simple pg node-fetch
```

---

## 🧪 Tester l'authentification

### 1. Démarrer le serveur

```bash
npm run dev
```

### 2. Ouvrir l'application

```
http://localhost:5001/login
```

### 3. Entrer les credentials

```
Email: arevel3@gatech.edu
Password: <ton mot de passe>
```

### 4. Vérifier la connexion

Après login réussi :
- Redirection automatique vers `/`
- Menu utilisateur en haut à droite
- Affiche email, nom, organisation
- Bouton "Log out"

### 5. Déboguer

**Logs serveur :** Regarde la console où tourne `npm run dev`

**Logs client :** Ouvre la console développeur (F12) → Onglet Console

**Requêtes réseau :** Onglet Network → Vérifie :
- `POST /api/auth/callback` → Status 200
- `GET /api/auth/me` → Status 200 avec user data

---

## 📊 Diagramme de séquence complet

```
User    Browser    Server    Session DB    Flask API
 │          │         │           │            │
 │──Visit──>│         │           │            │
 │          │──GET /login────>│           │            │
 │<─Form────│         │           │            │            │
 │          │         │           │            │            │
 │──Submit credentials──>│           │            │
 │          │         │           │            │            │
 │          │──POST /api/auth/callback────>│            │
 │          │         │           │            │            │
 │          │         │           │──POST /login (form)──>│
 │          │         │           │            │            │
 │          │         │           │<─302 + Set-Cookie─────│
 │          │         │           │            │            │
 │          │         │           │──GET /api/me─────────>│
 │          │         │           │            │            │
 │          │         │           │<─User data────────────│
 │          │         │           │            │            │
 │          │         │──INSERT session────>│            │
 │          │         │           │            │            │
 │          │<─{ user }─────────│            │            │
 │          │         │           │            │            │
 │          │──window.location.href = "/"               │
 │          │         │           │            │            │
 │          │──GET /──────────>│           │            │
 │          │         │           │            │            │
 │          │         │──Load session─>│            │            │
 │          │         │           │            │            │
 │          │<─HTML + User─────│            │            │
 │          │         │           │            │            │
 │<─App─────│         │           │            │            │
```

---

## ✅ Avantages de cette architecture

| Avantage | Explication |
|----------|-------------|
| **UX cohérente** | Login dans ton app, pas de redirect externe |
| **Simple** | Une seule page de login, formulaire standard |
| **Rapide** | Lecture en mémoire depuis la session |
| **Sécurisé** | Cookies HTTP-only, sameSite, secure |
| **Résiliant** | Pas de dépendance à Flask après login |
| **Clean** | Pas de table `users`, pas de sync à gérer |

---

## 🔧 Dépannage

### "Invalid email or password"

**Causes :**
1. Credentials incorrects
2. Flask API inaccessible
3. Content-Type incorrect (doit être `application/x-www-form-urlencoded`)

**Vérifie les logs serveur :**
```
[/api/auth/callback] Login response status: XXX
[/api/auth/callback] Set-Cookie: ...
```

### "Not authenticated"

**Cause :** Session expirée ou non trouvée

**Solution :** Se reconnecter via `/login`

### La redirection après login ne marche pas

**Vérifie :**
1. La console navigateur pour les erreurs JS
2. L'onglet Network : `POST /api/auth/callback` retourne 200 ?
3. Les logs console dans login.tsx

**Solution :** Utiliser `window.location.href = "/"` (pas `setLocation`)

### Redirect infinie

**Cause :** AuthGuard qui redirige vers /login mais /login est protégé

**Solution :** Vérifie que `/login` est exclu de l'AuthGuard dans `App.tsx`

---

## 📚 Checklist finale

### À faire ✅

- [x] Route POST /api/auth/callback (login)
- [x] Route GET /api/auth/me (vérification)
- [x] Route POST /api/auth/logout (déconnexion)
- [x] Page /login avec formulaire
- [x] Session PostgreSQL
- [x] AuthGuard qui redirige vers /login
- [x] Redirection manuelle après login (`window.location.href`)
- [x] Redirection manuelle après logout (`setLocation`)
- [x] Content-Type: `application/x-www-form-urlencoded` pour Flask
- [x] Cookie externe extrait avec `split(";")[0]`

### À ne PAS faire ❌

- [ ] Route GET /api/auth/callback (inutile)
- [ ] Route GET /api/auth/login (inutile)
- [ ] Table `users` en BDD
- [ ] Appels à Flask après le login
- [ ] `setLocation` après login (utiliser `window.location.href`)
- [ ] Body JSON pour Flask (utiliser `URLSearchParams`)

---

## 🎯 Résumé

- ✅ **Page de login locale** avec formulaire email/password
- ✅ **Session PostgreSQL** comme unique source de vérité
- ✅ **API Flask** utilisée UNIQUEMENT au login (form-urlencoded)
- ✅ **Cookies HTTP-only** pour la sécurité
- ✅ **Pas de table `users`** en base de données
- ✅ **Lecture en mémoire** pour toutes les requêtes après login
- ✅ **Redirection manuelle** après login/logout
