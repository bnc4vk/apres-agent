import { app } from "./app";

const port = Number(process.env.PORT ?? 5001);

app.listen(port, () => {
  console.log(`Apres AI running on http://localhost:${port}`);
});
