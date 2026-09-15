const http = require("http");
http.get("http://localhost:7000/health", (res) => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => {
        try {
            console.log(JSON.stringify(JSON.parse(data), null, 2));
        } catch(e) {
            console.log(data);
        }
    });
}).on("error", console.error);
