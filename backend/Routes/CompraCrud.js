const router = require("express").Router();
const puppeteer = require("puppeteer");
const compra = require("../Models/Compra");
const usuario = require("../Models/Usuario");
const cuenta = require("../Models/Cuenta");
const ejs = require("ejs");
const path = require("path");
const mongoose = require ("mongoose");

router.get("/TicketPDF/:id_ped.pdf", async (req, res) => {
	const p = await pedido.findById({ _id: req.params.id_ped });
	const nombre = await usuario.findById({ _id: p.Id_usuario });
	let lista_lib = [];
	for (let i = 0; i < p.Lista_lib.length; ++i) {
		const lib = await libro.findById({ _id: p.Lista_lib[i].Libro });
		lista_lib.push({
			Titulo: lib.Titulo,
			Precio: lib.Precio,
			Cantidad: p.Lista_lib[i].Cantidad,
			Formato: p.Lista_lib[i].Formato,
			Submonto: p.Lista_lib[i].Submonto
		});
	}

	const datosPDF = {
		nombre: `${nombre.Nombre} ${nombre.Apellido}`,
		Destino: `${p.Destino.Calle} #${p.Destino.Numero_int}, ${p.Destino.Colonia}, ${p.Destino.Ciudad},${p.Destino.Estado},${p.Destino.Pais}; CP. ${p.Destino.Codigo_postal}`,
		Fecha_pedido: new Date(p.Fecha_pedido).toLocaleDateString('es-MX'),
		Fecha_llegada: new Date(p.Fecha_llegada).toLocaleDateString('es-MX'),
		Sucursal: p.Sucursal,
		Codigo: p.Codigo,
		productos: [...lista_lib],
		Monto: p.Monto,
		Logo: path.join(process.cwd(), "template", "libro.png")
	};

	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await page.setRequestInterception(true);
	page.on("request", (interceptedRequest) => {
		const data = {
			method: "GET",
			postData: JSON.stringify({ pedido: Object.assign({}, datosPDF) }),
			headers: {
				...interceptedRequest.headers(),
				"Content-Type": "application/json",
			},
		};
		interceptedRequest.continue(data);
	});
	const response = await page.goto(
		"http://localhost:3000/Pedido/GenerarPaginaTicket",
		{
			waitUntil: "networkidle0",
		}
	);
	const pdf = await page.pdf({
		printBackground: true,
		format: "letter",
	});
	await browser.close();
	res.send(pdf);

});

router.get("/GenerarPaginaTicket", async (req, res) => {
	const filePath = path.join(process.cwd(), "template", "report-template.ejs");
	console.log(req.body.pedido);
	ejs.renderFile(filePath, { pedido: req.body.pedido }, (err, html) => {
		if (err) {
			console.log(err);
			return res.status(400).json({ error: err });
		} else {
			res.send(html);
		}
	});
});

//Añadir cuenta de compra.
router.put("/Insertar/:id_us", async (req, res) => {
	const idus = req.params.id_us;
	try {
		const buy = new compra({
			Id_usuario: mongoose.Types.ObjectId(idus),
			Id_cuenta: mongoose.Types.ObjectId(req.body.cuenta),
			Fecha: req.body.fecha,
			Estado: "Revision",
		});
		const savedBuy = buy.save();
		console.log(savedBuy);

		const accAdd = req.body.cuenta;
		cuenta.updateOne({ _id: accAdd },
				{
					Estado: "Vendida"
				})
			.then((doc) => {
		})
		res.json({
			error: null,
			response: "Añadido",
			data: savedBuy,
		});
	} catch (error) {
		console.log(error);
		res.status(400).json({ error });
	}
});

//Ver compra de usuario
router.get("/VerPed/:id_ped", async (req, res) => {
	const idbuy = req.params.id_ped;
	compra.aggregate([{$match: {_id: mongoose.Types.ObjectId(idbuy)}},
	{
		$lookup: {
			from: 'Cuenta',
			localField: 'Id_cuenta',
			foreignField: '_id',
			as: 'accountDetails'
		}
	}]).then((doc) => {
		res.json({ped: doc, error: null});
	})
});

//Ver todas las pedidos de un usuario
router.get("/Ver/:id_us", async (req, res) => {
	const idus = req.params.id_us;
	compra.aggregate([{ $match: {Id_usuario: mongoose.Types.ObjectId(idus)} },
	{
		$lookup: {
			from: 'Cuenta',
			localField: 'Id_cuenta',
			foreignField: '_id',
			as: 'accountDetails'
		}
	}]).limit(req.query.pagina*25).then((doc) => {
		res.json({ ped: doc, error: null });
	});
});

//Ver los pedidos por estado de un usuario
router.get("/VerEstado/:id_us/:est", async (req, res) => {
	const idus = req.params.id_us;
	const est = req.params.est;
	compra.find({ Id_usuario: idus, Estado: est }).then((doc) => {
		res.json({ ped: doc, error: null });
	});
});

//Cancelar Compra
router.put("/Cancelar/:id_ped", (req, res) => {
	const idped = req.params.id_ped;
	const est = "Cancelada";
	compra
		.findByIdAndUpdate(
			{ _id: idped},
			{
				$set: {
					Estado: est,
				},
			}
		)
		.then((doc) => {
			console.log(doc);
			cuenta.findByIdAndUpdate(
				{_id: mongoose.Types.ObjectId(doc.Id_cuenta)},
				{$set: {Estado: "Disponible"}}
				).then((doc) => {
					res.json({ response: "compra Modificada" });
				})
		})
		.catch((err) => {
			console.log("error al cambiar", err.message);
		});
});

//Admi crud

//Ver una compra
router.get("/VerCompra/:idped", async (req, res) => {
	const idped = req.params.id_ped;

	compra.findById({ _id: idped }).then((doc) => {
		res.json({ ped: doc, error: null });
	});
});

//Ver todas de los compras
router.get("/VerCompraTodos", async (req, res) => {

	compra.aggregate([
		{$match: { Estado: {$nin: ["Cancelada", "Vendida"]}}},
		{$lookup: {
			from: 'Cuenta',
			localField: 'Id_cuenta',
			foreignField: '_id',
			as: 'accountDetails'
		}}
	]).then((doc) => {
		res.json({ped: doc, error: null});
	})
});

//Modificar compra
router.put("/Modificar/:id_ped", (req, res) => {
	const idped = req.params.id_ped;
	const est = req.body.estado;

	compra
		.findByIdAndUpdate(
			{ _id: idped },
			{
				$set: {
					Estado: est,
				},
			}
		)
		.then((doc) => {
			res.json({ response: "pedido Modificado" });
		})
		.catch((err) => {
			console.log("error al cambiar", err.message);
		});
});

//Eliminar compra
router.get("/Eliminar/:id_ped", (req, res) => {
	const idped = req.params.id_ped;
	compra
		.findByIdAndDelete({ _id: idped })
		.then((doc) => {
			res.json({ response: "Eliminado" });
		})
		.catch((err) => {
			console.log("error al cambiar", err.message);
		});
});

module.exports = router;
