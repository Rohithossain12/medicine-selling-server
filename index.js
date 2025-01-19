require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const app = express();

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uv360.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("parmaWorld");
    const userCollection = db.collection("users");
    const medicineCollection = db.collection("medicine");
    const categoryCollection = db.collection("category");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      const authorization = req.headers?.authorization;
      console.log("inside verify token", req.headers, authorization);
      if (!req.headers?.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req.headers?.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      if (!result || result !== "admin")
        return res.status(403).send({ message: "forbidden access" });
      next();
    };

    // Verify admin middleware
    const verifySeller = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      if (!result || result !== "seller")
        return res.status(401).send({ message: "forbidden access" });
      next();
    };

    // Check admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // Check Seller
    app.get("/users/seller/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let seller = false;
      if (user) {
        seller = user?.role === "seller";
      }
      res.send({ seller });
    });

    // user related apis
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // updated user role
    app.patch("/users/:id", verifyToken, async (req, res) => {
      const id = req.params?.id;
      const newRole = req.body.role;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: newRole,
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // Check if the user already exists based on email
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.status(201).send(existingUser);
      }
      // Save the new user
      const result = await userCollection.insertOne(user);
      res.status(201).send(result);
    });

    // Medicine Related api
    //  save medicine data in db
    app.post("/medicines", verifyToken, async (req, res) => {
      const medicineData = req.body;
      const result = await medicineCollection.insertOne(medicineData);
      res.send(result);
    });

    // Category related api
    app.get("/category", async (req, res) => {
      const result = await categoryCollection.find().toArray();
      res.send(result);
    });
    //  save category data in db
    app.post("/category", verifyToken, async (req, res) => {
      const categoryData = req.body;
      const result = await categoryCollection.insertOne(categoryData);
      res.send(result);
    });

    // Update a category by ID
    app.put("/category/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { categoryName, categoryImage } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          categoryName,
          categoryImage,
        },
      };
      const result = await categoryCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Delete a category by ID
    app.delete("/category/:id", verifyToken, async (req, res) => {
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const result = await categoryCollection.deleteOne(query);
      res.send(result);
    });

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Medicine Selling Server..");
});

app.listen(port, () => {
  console.log(`Medicine Selling is running on port ${port}`);
});
