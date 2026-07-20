# 💧 みずログ (water-tracker)

毎日の水分摂取量を記録して、一目で管理できる PWA。

## 特徴
- グラスが満ちていく可視化で今日の達成度がひと目でわかる
- ワンタップ記録（コップ200 / 缶350 / ペット500 / 自由入力）＋直前取り消し
- 1日の目標設定（プリセット付き）と達成メッセージ
- 週間バーチャート＋1日平均
- 飲水リマインダー通知（アプリ表示中に一定間隔で通知）
- 記録の CSV 書き出し（Excel対応・BOM付き）
- localStorage 永続化＋Service Worker でオフライン対応、スマホにインストール可

## 公開URL
https://sloppythinker.github.io/water-tracker/

## 開発
```bash
python3 -m http.server 8000   # → http://localhost:8000/
npm install && npm test        # jsdom による実行レベルテスト
```
