"""Fine-tune a MobileNetV3 into a card-art embedder (run with a torch-enabled python).

Contrastive (InfoNCE) between a heavily degraded view and a light view of the
same printing, over in-batch negatives: the model learns that a hazy, glared,
blurred photo of a card is the same thing as its clean scan, and that other
printings are not. Reference images come from fetch-reference-images.mjs.

  python scripts/train-embedder/train.py --refs .scan-build/refs-full --out .scan-build/models/embedder
"""
import argparse, json, os, sys, time
import cv2, numpy as np, torch, torch.nn as nn, torch.nn.functional as F, torchvision
sys.path.insert(0, os.path.dirname(__file__))
from aug import query_view

MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
IN_W, IN_H = 160, 224


class Embedder(nn.Module):
    def __init__(self, dim=128, arch="small"):
        super().__init__()
        m = (torchvision.models.mobilenet_v3_small if arch == "small" else torchvision.models.mobilenet_v3_large)(weights="DEFAULT")
        self.features = m.features
        c = m.features[-1].out_channels
        self.head = nn.Sequential(nn.Linear(c, dim))

    def forward(self, x):
        f = self.features(x).mean(dim=(2, 3))
        return F.normalize(self.head(f), dim=1)


def to_tensor(f):
    return torch.from_numpy(((f - MEAN) / STD).transpose(2, 0, 1).copy())


class Data(torch.utils.data.Dataset):
    def __init__(self, imgs, epoch_len):
        self.imgs, self.n = imgs, epoch_len
    def __len__(self):
        return self.n
    def __getitem__(self, i):
        rng = np.random.default_rng((i * 7919 + int(time.time() * 1000)) % 2**32)
        img = self.imgs[rng.integers(len(self.imgs))]
        a = query_view(img, rng, IN_W, IN_H, heavy=True)
        b = query_view(img, rng, IN_W, IN_H, heavy=False)
        return to_tensor(a), to_tensor(b)


def load_refs(refs, base=(200, 280)):
    idx = json.load(open(os.path.join(refs, "index.json")))
    imgs, ids = [], []
    for e in idx:
        im = cv2.imread(os.path.join(refs, e["file"]))
        if im is None: continue
        imgs.append(cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2RGB), base, interpolation=cv2.INTER_AREA))
        ids.append(e["card_id"])
    return np.stack(imgs), ids


def clean(img):
    return to_tensor(cv2.resize(img, (IN_W, IN_H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255)


@torch.no_grad()
def embed_all(model, imgs, bs=128):
    model.eval(); out = []
    for i in range(0, len(imgs), bs):
        out.append(model(torch.stack([clean(x) for x in imgs[i:i + bs]])))
    return torch.cat(out)


def real_queries(refs_dir):
    base = os.path.dirname(refs_dir.rstrip("/"))
    qd = os.path.join(base, "real-photos")
    quads = json.load(open(os.path.join(qd, "quads.json"))); out = []
    for ph, items in quads.items():
        im = cv2.cvtColor(cv2.imread(os.path.join(qd, ph)), cv2.COLOR_BGR2RGB)
        for it in items:
            q = np.float32([[p["x"], p["y"]] for p in it["quad"]])
            d = np.float32([[0, 0], [400, 0], [400, 560], [0, 560]])
            out.append((it, cv2.warpPerspective(im, cv2.getPerspectiveTransform(q, d), (400, 560), flags=cv2.INTER_CUBIC)))
    return out


def eval_real(model, refs_emb, ids, qs):
    ranks = []
    ids = np.array(ids)
    model.eval()
    with torch.no_grad():
        for it, img in qs:
            q = model(clean(cv2.resize(img, (200, 280), interpolation=cv2.INTER_AREA))[None])[0]
            order = torch.argsort(-(refs_emb @ q)).numpy()
            acc = set(it["accept"])
            ranks.append(next(k for k, j in enumerate(order) if ids[j] in acc))
    return ranks


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refs", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=10); ap.add_argument("--epoch-len", type=int, default=6912)
    ap.add_argument("--batch", type=int, default=96); ap.add_argument("--dim", type=int, default=128)
    ap.add_argument("--arch", default="small"); ap.add_argument("--threads", type=int, default=3)
    ap.add_argument("--workers", type=int, default=2); ap.add_argument("--lr", type=float, default=6e-4)
    ap.add_argument("--max-minutes", type=float, default=1e9)
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    imgs, ids = load_refs(a.refs); print("refs", len(imgs), flush=True)
    qs = real_queries(a.refs)
    model = Embedder(a.dim, a.arch)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    steps = a.epochs * (a.epoch_len // a.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=steps, pct_start=0.1)
    t0 = time.time(); step = 0
    for ep in range(a.epochs):
        dl = torch.utils.data.DataLoader(Data(imgs, a.epoch_len), batch_size=a.batch, num_workers=a.workers, drop_last=True)
        model.train(); tl = 0
        for xa, xb in dl:
            za, zb = model(xa), model(xb)
            logits = za @ zb.T / 0.07
            lab = torch.arange(len(za))
            loss = (F.cross_entropy(logits, lab) + F.cross_entropy(logits.T, lab)) / 2
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); step += 1; tl += loss.item()
            if step % 10 == 0: print(f"  step {step}/{steps} loss {loss.item():.3f} {time.time()-t0:.0f}s", flush=True)
        # monitor on a gallery of 2000 refs plus the true cards of the real queries
        rng = np.random.default_rng(0)
        sub = set(rng.choice(len(imgs), 2000, replace=False).tolist())
        for it, _ in qs:
            for j, cid in enumerate(ids):
                if cid in it["accept"]: sub.add(j)
        sub = sorted(sub)
        g = embed_all(model, imgs[sub]); r = eval_real(model, g, [ids[j] for j in sub], qs)
        print(f"epoch {ep} loss {tl/len(dl):.3f} real ranks in {len(sub)}-gallery {r} top1 {sum(x==0 for x in r)} {time.time()-t0:.0f}s", flush=True)
        torch.save(model.state_dict(), a.out + ".pt")
        if (time.time() - t0) / 60 > a.max_minutes: break
