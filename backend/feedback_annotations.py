"""Save/load endpoint for the feedback viewer's evaluation mode (served at /feedback/).
GET  /api/annotations/<coder>.json  -> that coder's saved evaluation (404 if none yet)
POST /api/annotations/<coder>.json  -> save it (JSON body, max 5 MB; atomic; previous version kept as .bak)
Files live in backend/annotations/ (git-ignored, outside data/ so they never show up as a dashboard folder);
override with FEEDBACK_ANN_DIR. Coder names: letters, digits, _ or -, max 40."""
import json, os, re
from pathlib import Path
from flask import Flask, request, send_file, make_response

NAME = re.compile(r'[A-Za-z0-9_-]{1,40}')


def register_feedback_annotations(app: Flask) -> None:
    ann_dir = Path(os.environ.get('FEEDBACK_ANN_DIR', Path(__file__).resolve().parent / 'annotations'))

    @app.route('/api/annotations/<coder>.json', methods=['GET', 'POST'])
    def feedback_annotations(coder: str):
        if not NAME.fullmatch(coder):
            return {'error': 'bad coder name'}, 400
        path = ann_dir / f'{coder}.json'
        if request.method == 'GET':
            if not path.exists():
                return {'error': 'not found'}, 404
            resp = send_file(path, mimetype='application/json', max_age=0)
            resp.headers['Cache-Control'] = 'no-store'
            return resp
        body = request.get_data(cache=False)
        if not body or len(body) > 5 << 20:
            return {'error': 'empty or too large'}, 400
        try:
            json.loads(body)
        except ValueError:
            return {'error': 'not JSON'}, 400
        ann_dir.mkdir(parents=True, exist_ok=True)
        if path.exists():
            os.replace(path, path.with_suffix('.json.bak'))
        tmp = path.with_suffix('.json.tmp')
        tmp.write_bytes(body)
        os.replace(tmp, path)
        return make_response('', 204)
