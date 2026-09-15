const http = require("http");
http.get("http://localhost:7000/catalog/tv/nuvio_sports_tennis.json", (res) => {
    let data = "";
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
        const parsed = JSON.parse(data);
        const match = parsed.metas.find(m => m.name && (m.name.includes("Vacherot") || m.name.includes("Kovacevic")));
        if (match) {
            console.log("Match ID:", match.id);
            http.get("http://localhost:7000/stream/tv/" + match.id + ".json", (res2) => {
                let data2 = "";
                res2.on("data", (c) => data2 += c);
                res2.on("end", () => {
                    console.log("Streams:");
                    console.log(JSON.parse(data2).streams.map(s => s.name || s.title));
                });
            });
        }
    });
});
