<script setup>
import { ref } from "vue";
import { ejecutarPrueba } from "../motor/prueba.js";

const resultado = ref("");

function alProbar() {
  resultado.value = ejecutarPrueba();
}
</script>

<template>
  <main>
    <h1>Horas extras - fase 0</h1>
    <button type="button" @click="alProbar">Probar motor</button>
    <p v-if="resultado !== ''">Resultado: {{ resultado }}</p>
  </main>
</template>
