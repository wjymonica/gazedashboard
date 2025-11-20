from flask import Flask, jsonify, send_file, make_response
from flask_cors import CORS
import os
from pathlib import Path
import numpy as np


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    # Prefer a local data directory under backend for all assets; fallback to project root
    backend_dir = Path(__file__).resolve().parent
    project_root = backend_dir.parent
    data_dir = backend_dir / 'data'
    root = data_dir if data_dir.exists() else project_root
    video_path = root / 'lap_full_voice.mp4'
    gaze_path = root / 'gaze_positions.npy'
    quickview_path = root / 'quickview.mp4'
    # Optional HEIC support via pillow-heif if available
    try:
        from PIL import Image  # type: ignore
        try:
            import pillow_heif  # type: ignore
            pillow_heif.register_heif_opener()
        except Exception:
            pass
    except Exception:
        Image = None  # type: ignore

    @app.get("/api/health")
    def health() -> tuple[dict, int]:
        return {"status": "ok"}, 200

    @app.get("/api/version")
    def version() -> tuple[dict, int]:
        return {"service": "gaze-backend", "version": "0.1.0"}, 200

    @app.route('/api/video', methods=['GET', 'HEAD', 'OPTIONS'])
    def serve_video():
        if os.environ.get('FLASK_CORS_ANY', '1') == '1':
            resp = make_response()
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
            resp.headers['Access-Control-Allow-Methods'] = 'GET,HEAD,OPTIONS'
            if 'OPTIONS' == (os.environ.get('REQUEST_METHOD') or '').upper():
                return resp
        if not video_path.exists():
            return jsonify({"error": "Video not found"}), 404
        if (os.environ.get('REQUEST_METHOD') or '').upper() == 'HEAD':
            return ('', 200)
        resp = send_file(video_path, mimetype='video/mp4', conditional=True)
        resp.headers['Accept-Ranges'] = 'bytes'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp

    @app.route('/api/quickview', methods=['GET', 'HEAD', 'OPTIONS'])
    def serve_quickview():
        if os.environ.get('FLASK_CORS_ANY', '1') == '1':
            resp = make_response()
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
            resp.headers['Access-Control-Allow-Methods'] = 'GET,HEAD,OPTIONS'
            if 'OPTIONS' == (os.environ.get('REQUEST_METHOD') or '').upper():
                return resp
        if not quickview_path.exists():
            return jsonify({"error": "Quick view video not found"}), 404
        if (os.environ.get('REQUEST_METHOD') or '').upper() == 'HEAD':
            return ('', 200)
        resp = send_file(quickview_path, mimetype='video/mp4', conditional=True)
        resp.headers['Accept-Ranges'] = 'bytes'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    
    @app.get('/api/image/<path:filename>')
    def serve_image(filename: str):
        # Allow serving only from the root directory and common image types
        allowed_ext = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'}
        from pathlib import Path as _Path
        import io
        safe = _Path(filename).name  # prevent directory traversal
        file_path = root / safe
        if not file_path.exists():
            return jsonify({"error": "Image not found"}), 404
        if file_path.suffix.lower() not in allowed_ext:
            return jsonify({"error": "Unsupported image type"}), 400
        # Best-effort mime
        mime = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.heic': 'image/heic',
            '.heif': 'image/heif',
        }.get(file_path.suffix.lower(), 'application/octet-stream')
        try:
            # Convert HEIC/HEIF to JPEG if PIL is available (better browser support)
            if file_path.suffix.lower() in ('.heic', '.heif') and 'Image' in globals() and Image is not None:
                try:
                    im = Image.open(str(file_path))
                    buf = io.BytesIO()
                    im.convert('RGB').save(buf, format='JPEG', quality=90)
                    buf.seek(0)
                    resp = make_response(buf.read())
                    resp.mimetype = 'image/jpeg'
                    resp.headers['Access-Control-Allow-Origin'] = '*'
                    return resp
                except Exception:
                    # Fallback to sending raw file if conversion fails (Safari may still display HEIC)
                    pass
            resp = send_file(file_path, mimetype=mime, conditional=True)
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.get('/api/gaze')
    def get_gaze():
        if not gaze_path.exists():
            return jsonify({"points": [], "normalized": True})
        try:
            arr = np.load(gaze_path, allow_pickle=True)
            # Coerce to (N,2)
            a = np.asarray(arr)
            pts = []
            if a.ndim == 2 and a.shape[-1] >= 2:
                pts = a[:, :2]
            elif a.ndim == 3 and a.shape[-1] >= 2:
                # If (F,P,2+), take first point per frame
                pts = a[:, 0, :2]
            elif a.ndim == 1 and a.size >= 2:
                pts = a.reshape(-1, 2)[:,:2]
            else:
                pts = np.zeros((0,2), dtype=float)

            pts = np.nan_to_num(pts, nan=-1.0)
            # Heuristic: values within [0,1.5] likely normalized
            max_xy = np.max(pts, axis=0) if pts.size else np.array([0.0, 0.0])
            normalized = bool(max_xy[0] <= 1.5 and max_xy[1] <= 1.5)
            return jsonify({
                "points": pts.astype(float).tolist(),
                "normalized": normalized
            })
        except Exception as exc:
            return jsonify({"points": [], "normalized": True, "error": str(exc)}), 200

    @app.get('/api/summary')
    def get_summary_csv():
        # Prefer summaryv3.csv; fallback to summaryv2.csv, summary.csv, then older merged file if not present
        candidates = [
            root / 'summaryv3.csv',
            root / 'summaryv2.csv',
            root / 'summary.csv',
            root / 'lap_neon_gaze_semantic_summary_merged.csv',
        ]
        csv_path = next((p for p in candidates if p.exists()), None)
        if csv_path is None:
            return jsonify({"error": "Summary CSV not found"}), 404
        try:
            with csv_path.open('r', encoding='utf-8') as f:
                text = f.read()
            resp = make_response(text)
            resp.mimetype = 'text/csv'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.get('/api/summary_categories')
    def get_summary_categories_csv():
        csv_path = root / 'lap_neon_gaze_semantic_summary_merged.csv'
        if not csv_path.exists():
            return jsonify({"error": "Merged summary CSV not found"}), 404
        try:
            with csv_path.open('r', encoding='utf-8') as f:
                text = f.read()
            resp = make_response(text)
            resp.mimetype = 'text/csv'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.get('/api/transcript')
    def get_transcript_srt():
        srt_path = root / 'lap+neon+gaze.srt'
        if not srt_path.exists():
            return jsonify({"error": "Transcript SRT not found"}), 404
        try:
            with srt_path.open('r', encoding='utf-8') as f:
                text = f.read()
            resp = make_response(text)
            resp.mimetype = 'text/plain'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.get('/api/standing')
    def get_standing_csv():
        csv_path = root / 'standing.csv'
        if not csv_path.exists():
            return jsonify({"error": "Standing CSV not found"}), 404
        try:
            with csv_path.open('r', encoding='utf-8') as f:
                text = f.read()
            resp = make_response(text)
            resp.mimetype = 'text/csv'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.get('/api/quick_preview')
    def get_quick_preview_segments():
        csv_path = root / 'uniform_samples.csv'
        if not csv_path.exists():
            return jsonify({"error": "Quick preview CSV not found"}), 404
        try:
            with csv_path.open('r', encoding='utf-8') as f:
                text = f.read()
            resp = make_response(text)
            resp.mimetype = 'text/csv'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.get('/api/surgical_role_transitions')
    def get_surgical_role_transitions():
        md_path = root / 'surgical_role_transitions.md'
        if not md_path.exists():
            return jsonify({"error": "surgical_role_transitions.md not found"}), 404
        try:
            with md_path.open('r', encoding='utf-8') as f:
                text = f.read()
            resp = make_response(text)
            resp.mimetype = 'text/markdown'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    @app.get('/api/phases')
    def get_phases_csv():
        csv_path = root / 'phases.csv'
        if not csv_path.exists():
            return jsonify({"error": "Phases CSV not found"}), 404
        try:
            with csv_path.open('r', encoding='utf-8') as f:
                text = f.read()
            resp = make_response(text)
            resp.mimetype = 'text/csv'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.route('/api/summary/importance', methods=['POST', 'OPTIONS'])
    def update_summary_importance():
        # CORS preflight support
        if os.environ.get('FLASK_CORS_ANY', '1') == '1':
            resp = make_response()
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
            resp.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS'
            if 'OPTIONS' == (os.environ.get('REQUEST_METHOD') or '').upper():
                return resp
        import json, csv
        csv_path = root / 'summaryv3.csv'
        if not csv_path.exists():
            return jsonify({"error": "summaryv3.csv not found"}), 404
        try:
            payload = json.loads((os.environ.get('RAW_BODY') or '') or (getattr(app, 'raw_request_body', None) or ''))  # placeholder, will fallback to request.get_json below
        except Exception:
            payload = None
        try:
            from flask import request  # import here to avoid top-level cycle
            if not payload:
                payload = request.get_json(silent=True) or {}
            updates = payload.get('updates', [])
            if not isinstance(updates, list):
                return jsonify({"error": "Invalid payload: updates must be a list"}), 400
            # Read CSV
            with csv_path.open('r', encoding='utf-8', newline='') as f:
                reader = csv.reader(f)
                rows = list(reader)
            if not rows:
                return jsonify({"error": "CSV is empty"}), 400
            header = rows[0]
            # Ensure 'importance' column exists
            lower_header = [h.strip().lower() for h in header]
            if 'importance' in lower_header:
                importance_idx = lower_header.index('importance')
            else:
                header.append('importance')
                importance_idx = len(header) - 1
            # Build a map rowIndex -> new importance
            row_updates = {}
            for u in updates:
                try:
                    ri = int(u.get('rowIndex'))
                    imp_val = u.get('importance')
                    if ri < 0:
                        continue
                    row_updates[ri] = '' if imp_val is None else str(imp_val)
                except Exception:
                    continue
            # Apply updates to data rows (excluding header). Data row i corresponds to rows[i+1]
            for ri, val in row_updates.items():
                row_pos = ri + 1
                if row_pos >= 1 and row_pos < len(rows):
                    row = rows[row_pos]
                    # pad row if needed
                    if len(row) < len(header):
                        row = row + [''] * (len(header) - len(row))
                    row[importance_idx] = val
                    rows[row_pos] = row
            # Write back CSV
            with csv_path.open('w', encoding='utf-8', newline='') as f:
                writer = __import__('csv').writer(f)
                writer.writerow(header)
                for r in rows[1:]:
                    if len(r) < len(header):
                        r = r + [''] * (len(header) - len(r))
                    writer.writerow(r)
            resp = jsonify({"status": "ok", "updated": len(row_updates)})
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @app.route('/api/summary/comments', methods=['POST', 'OPTIONS'])
    def update_summary_comments():
        # CORS preflight support
        if os.environ.get('FLASK_CORS_ANY', '1') == '1':
            resp = make_response()
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
            resp.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS'
            if 'OPTIONS' == (os.environ.get('REQUEST_METHOD') or '').upper():
                return resp
        import json, csv
        csv_path = root / 'summaryv3.csv'
        if not csv_path.exists():
            return jsonify({"error": "summaryv3.csv not found"}), 404
        try:
            from flask import request
            payload = request.get_json(silent=True) or {}
            updates = payload.get('updates', [])
            if not isinstance(updates, list):
                return jsonify({"error": "Invalid payload: updates must be a list"}), 400
            # Read CSV
            with csv_path.open('r', encoding='utf-8', newline='') as f:
                reader = csv.reader(f)
                rows = list(reader)
            if not rows:
                return jsonify({"error": "CSV is empty"}), 400
            header = rows[0]
            lower_header = [h.strip().lower() for h in header]
            # Ensure 'Comments' column exists
            if 'comments' in lower_header:
                comments_idx = lower_header.index('comments')
            else:
                header.append('Comments')
                comments_idx = len(header) - 1
            # Apply updates by rowIndex
            updated_count = 0
            for u in updates:
                try:
                    ri = int(u.get('rowIndex'))
                    comment_val = u.get('comment')
                except Exception:
                    continue
                row_pos = ri + 1
                if row_pos >= 1 and row_pos < len(rows):
                    row = rows[row_pos]
                    if len(row) < len(header):
                        row = row + [''] * (len(header) - len(row))
                    row[comments_idx] = '' if comment_val is None else str(comment_val)
                    rows[row_pos] = row
                    updated_count += 1
            # Write back CSV
            with csv_path.open('w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(header)
                for r in rows[1:]:
                    if len(r) < len(header):
                        r = r + [''] * (len(header) - len(r))
                    writer.writerow(r)
            resp = jsonify({"status": "ok", "updated": updated_count})
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    return app


app = create_app()


if __name__ == "__main__":
    # Configurable dev server port via PORT env (default 5000)
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)


