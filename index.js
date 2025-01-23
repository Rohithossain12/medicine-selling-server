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
    const cartCollection = db.collection("cart");

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

    // user data save in db
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

    // user data update

    app.put("/user/updateProfile/:email", verifyToken, async (req, res) => {
      console.log("Request Params:", req.params);
      console.log("Request Body:", req.body);

      const email = req.params.email;
      const filter = { email: email };
      const { name, photo } = req.body;

      const updatedDoc = {
        $set: {
          name,
          photo,
        },
      };

      try {
        const result = await userCollection.updateOne(filter, updatedDoc);
        console.log("Update Result:", result);

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Profile updated successfully." });
        } else {
          res.status(404).send({ error: "User not found or no changes made." });
        }
      } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).send({ error: "Internal server error." });
      }
    });

    // Medicine Related api

    // get all medicine
    app.get("/medicines", async (req, res) => {
      const { category } = req.query; // Extract category from query parameters

      let query = {};
      if (category) {
        query = { category }; // Add category filter if provided
      }
      const result = await medicineCollection.find(query).toArray();
      res.send(result);
    });


    // filter by discount medicine
    app.get("/discount-products", async (req, res) => {
      try {
        // Aggregation to filter products with discount greater than 0
        const discountProducts = await medicineCollection
          .aggregate([
            {
              $match: {
                discount: { $type: "string" },
              },
            },
            {
              $addFields: {
                discount: {
                  $toInt: "$discount", // Convert discount string to number
                },
              },
            },
            {
              $match: {
                discount: { $gt: 0 },
              },
            },
          ])
          .toArray();

        if (discountProducts.length > 0) {
          res.status(200).send(discountProducts);
        } else {
          res.status(404).send({ message: "No discounted products found." });
        }
      } catch (error) {
        console.error("Error fetching discounted products:", error);
        res.status(500).send({ error: "Internal server error." });
      }
    });

    //  save medicine data in db
    app.post("/medicines", verifyToken, async (req, res) => {
      const medicineData = req.body;
      const result = await medicineCollection.insertOne(medicineData);
      res.send(result);
    });

    // Update a medicine by ID
    app.put("/medicine/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateMedicine = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: updateMedicine,
      };
      const result = await medicineCollection.updateOne(filter, updatedDoc);
    });

    // Delete a Medicine By ID
    app.delete("/medicine/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await medicineCollection.deleteOne(filter);
      res.send(result);
    });

    // Category related api
    app.get("/categories", async (req, res) => {
      const result = await categoryCollection.find().limit(6).toArray();
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
      const { categoryName, companyName, categoryImage } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          categoryName,
          categoryImage,
          companyName,
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

    // cart related api

    app.get("/cart/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const result = await cartCollection.find(filter).toArray();
      res.send(result);
    });

    // save cart data in db
    app.post("/cart", verifyToken, async (req, res) => {
      const addToCart = req.body;
      const result = await cartCollection.insertOne(addToCart);
      res.send(result);
    });
    // update quantity
    app.put("/cart/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id; // Item ID from URL
        const { quantity } = req.body; // Extract quantity from request body

        // Fetch the item to get the unit price
        const item = await cartCollection.findOne({ _id: new ObjectId(id) });

        if (!item) {
          return res
            .status(404)
            .json({ success: false, message: "Item not found" });
        }

        // Calculate the new total price based on quantity and unit price
        const totalPrice = parseFloat(item.price) * quantity;

        // Update the quantity and total price in the database
        const result = await cartCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { quantity, totalPrice } }
        );

        if (result.modifiedCount > 0) {
          res.json({
            success: true,
            message: "Quantity updated successfully!",
          });
        } else {
          res.json({ success: false, message: "Failed to update quantity" });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });

    // Remove a specific item from the cart
    app.delete("/cart/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });
    // Remove  all item from the cart
    app.delete("/cart", verifyToken, async (req, res) => {
      const result = await cartCollection.deleteMany();
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
